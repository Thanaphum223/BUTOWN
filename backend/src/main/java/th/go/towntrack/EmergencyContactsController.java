package th.go.towntrack;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/emergency")
public class EmergencyContactsController {
  private final GeocodingController geocoding;
  private final List<Map<String, Object>> verified;
  private static final Map<String, String> TYPES = Map.of(
      "hospital", "[hospital]", "police", "[police]",
      "fire_station", "[fire station]", "clinic", "[clinic]");

  public EmergencyContactsController(GeocodingController geocoding, ObjectMapper json) throws IOException {
    this.geocoding = geocoding;
    try (var input = getClass().getResourceAsStream("/emergency-contacts.json")) {
      verified = json.readValue(input, new TypeReference<List<Map<String, Object>>>() {});
    }
  }

  @GetMapping("/nearby")
  public Object nearby(@RequestParam double latitude, @RequestParam double longitude,
      @RequestParam(defaultValue = "hospital") String type,
      @RequestParam(defaultValue = "5") int radiusKm) throws Exception {
    if (!Double.isFinite(latitude) || !Double.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
        || !TYPES.containsKey(type) || !List.of(5, 10, 20).contains(radiusKm))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "จุดค้นหาหรือประเภทสถานที่ไม่ถูกต้อง");
    double lat = Math.round(latitude * 1000) / 1000.0;
    double lon = Math.round(longitude * 1000) / 1000.0;
    double dy = radiusKm / 110.0;
    double dx = dy / Math.max(0.01, Math.cos(Math.toRadians(lat)));
    String box = String.format(Locale.ROOT, "%.6f,%.6f,%.6f,%.6f", lon-dx,lat+dy,lon+dx,lat-dy);
    Object raw;
    try {
      raw = geocoding.call("/search?format=jsonv2&countrycodes=th&addressdetails=1&extratags=1&limit=10&bounded=1&viewbox="
        + box + "&q=" + URLEncoder.encode(TYPES.get(type), StandardCharsets.UTF_8));
    } catch (ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      if (e instanceof InterruptedException) Thread.currentThread().interrupt();
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
          "ค้นหาสถานที่ไม่ได้ในขณะนี้ กรุณาใช้เบอร์สายด่วนด้านบน หรือลองอีกครั้ง");
    }
    return withDirectory(results(raw, latitude, longitude, radiusKm), latitude, longitude, radiusKm, type);
  }

  @SuppressWarnings("unchecked")
  Map<String, Object> withDirectory(Map<String, Object> response, double latitude, double longitude, int radiusKm, String type) {
    var places = new ArrayList<>((List<Map<String, Object>>) response.get("places"));
    for (var entry : verified) {
      if (!type.equals(entry.get("type")) || !(entry.get("latitude") instanceof Number lat)
          || !(entry.get("longitude") instanceof Number lon)) continue;
      double meters = distance(latitude, longitude, lat.doubleValue(), lon.doubleValue());
      if (meters > radiusKm * 1000 || places.stream().anyMatch(p -> p.get("name").equals(entry.get("name")))) continue;
      var place = new LinkedHashMap<String, Object>();
      place.put("id", "directory:" + entry.get("name"));
      place.put("name", entry.get("name"));
      place.put("address", entry.get("address"));
      place.put("latitude", lat.doubleValue());
      place.put("longitude", lon.doubleValue());
      place.put("distanceMeters", Math.round(meters));
      place.put("phones", phones(String.join(";", ((List<?>) entry.get("phones")).stream().map(Object::toString).toList())));
      place.put("sourceUrl", entry.get("coordinateSource"));
      place.put("phoneSourceUrl", entry.get("source"));
      place.put("phoneCheckedAt", entry.get("checked"));
      place.put("website", safeWebsite(entry.get("source").toString()));
      places.add(place);
    }
    if (type.equals("police")) places.removeIf(p -> {
      String name = p.get("name").toString().toLowerCase(Locale.ROOT);
      return List.of("immigration", "forensic", "ตรวจคนเข้าเมือง", "พิสูจน์หลักฐาน")
          .stream().anyMatch(name::contains);
    });
    places.sort(Comparator.comparingLong(p -> ((Number) p.get("distanceMeters")).longValue()));
    return Map.of("places", places.stream().limit(10).toList(), "radiusKm", radiusKm,
        "source", "OpenStreetMap / Nominatim and official contact directory");
  }

  Map<String, Object> results(Object raw, double latitude, double longitude, int radiusKm) {
    if (!(raw instanceof List<?> entries))
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "บริการค้นหาสถานที่ไม่พร้อม กรุณาใช้เบอร์สายด่วนด้านบน");
    var results = new ArrayList<Map<String, Object>>();
    for (Object entry : entries) {
      if (!(entry instanceof Map<?, ?> place)) continue;
      Map<?, ?> address = place.get("address") instanceof Map<?, ?> a ? a : Map.of();
      if (!"th".equals(address.get("country_code"))) continue;
      double lat, lon;
      try {
        lat = Double.parseDouble(String.valueOf(place.get("lat")));
        lon = Double.parseDouble(String.valueOf(place.get("lon")));
      } catch (NumberFormatException e) { continue; }
      if (!Double.isFinite(lat) || !Double.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) continue;
      double distance = distance(latitude, longitude, lat, lon);
      if (distance > radiusKm * 1000) continue;
      String display = Objects.toString(place.get("display_name"), "");
      String name = Objects.toString(place.get("name"), display.split(",")[0]).trim();
      if (name.isEmpty()) continue;
      Map<?, ?> extra = place.get("extratags") instanceof Map<?, ?> x ? x : Map.of();
      String osmType = Objects.toString(place.get("osm_type"), "");
      String osmId = Objects.toString(place.get("osm_id"), "");
      String source = List.of("node", "way", "relation").contains(osmType) && osmId.matches("[0-9]+")
          ? "https://www.openstreetmap.org/" + osmType + "/" + osmId : "https://www.openstreetmap.org/";
      var phones = phones(Objects.toString(extra.get("contact:phone"), Objects.toString(extra.get("phone"), "")));
      String phoneSource = source;
      String checked = "";
      for (var contact : verified) {
        if (contact.get("name").equals(name) && display.contains(contact.get("province").toString())) {
          phones = phones(String.join(";", ((List<?>) contact.get("phones")).stream().map(Object::toString).toList()));
          phoneSource = contact.get("source").toString();
          checked = contact.get("checked").toString();
          break;
        }
      }
      var result = new LinkedHashMap<String, Object>();
      result.put("id", Objects.toString(place.get("place_id"), osmType + osmId));
      result.put("name", name);
      result.put("address", display);
      result.put("latitude", lat);
      result.put("longitude", lon);
      result.put("distanceMeters", Math.round(distance));
      result.put("phones", phones);
      result.put("sourceUrl", source);
      result.put("phoneSourceUrl", phoneSource);
      result.put("phoneCheckedAt", checked);
      String site = Objects.toString(extra.get("contact:website"), Objects.toString(extra.get("website"), ""));
      result.put("website", safeWebsite(site));
      results.add(result);
    }
    results.sort(Comparator.comparingLong(r -> ((Number) r.get("distanceMeters")).longValue()));
    return Map.of("places", results, "radiusKm", radiusKm, "source", "OpenStreetMap / Nominatim");
  }

  static List<String> phones(String raw) {
    return Arrays.stream(raw.split("[;,]"))
        .map(String::trim)
        .filter(s -> s.matches("\\+?[0-9 ()-]+"))
        .map(s -> s.replace("(0)", "").replaceAll("[ ()-]", ""))
        .filter(s -> s.matches("(?:0[2-57][0-9]{7}|0[689][0-9]{8}|\\+66[2-57][0-9]{7}|\\+66[689][0-9]{8})"))
        .distinct().limit(4).toList();
  }

  static String safeWebsite(String value) {
    try {
      var uri = java.net.URI.create(value);
      return ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) && uri.getHost() != null
          && uri.getUserInfo() == null ? uri.toString() : "";
    } catch (IllegalArgumentException e) { return ""; }
  }

  static double distance(double a, double b, double c, double d) {
    double p = Math.PI / 180;
    double n = Math.pow(Math.sin((c-a)*p/2),2)
        + Math.cos(a*p)*Math.cos(c*p)*Math.pow(Math.sin((d-b)*p/2),2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(n), Math.sqrt(Math.max(0,1-n)));
  }
}
