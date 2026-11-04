package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

class EmergencyContactsTest {
  EmergencyContactsController service(GeocodingController provider) throws Exception {
    return new EmergencyContactsController(provider, new ObjectMapper());
  }

  Map<String, Object> place(
      String name, double lat, double lon, String country, Map<String, String> extra) {
    return Map.of(
        "place_id",
        name,
        "osm_type",
        "way",
        "osm_id",
        "12345",
        "name",
        name,
        "display_name",
        name + ", จังหวัดนนทบุรี, ประเทศไทย",
        "lat",
        String.valueOf(lat),
        "lon",
        String.valueOf(lon),
        "address",
        Map.of("country_code", country),
        "extratags",
        extra);
  }

  @Test
  void invalidCoordinatesTypesAndRadiusCannotQueryProvider() throws Exception {
    var provider = mock(GeocodingController.class);
    var api = service(provider);
    assertThrows(ResponseStatusException.class, () -> api.nearby(Double.NaN, 100, "hospital", 5));
    assertThrows(ResponseStatusException.class, () -> api.nearby(13.9, 100.3, "unsupported", 5));
    assertThrows(ResponseStatusException.class, () -> api.nearby(13.9, 100.3, "police", 100));
    verifyNoInteractions(provider);
  }

  @Test
  void usesBoundedThailandSearchWithContactTags() throws Exception {
    var provider = mock(GeocodingController.class);
    when(provider.call(anyString())).thenReturn(List.of());
    service(provider).nearby(13.982103, 100.325964, "hospital", 5);
    var query = ArgumentCaptor.forClass(String.class);
    verify(provider).call(query.capture());
    assertTrue(query.getValue().contains("countrycodes=th"));
    assertTrue(query.getValue().contains("extratags=1"));
    assertTrue(query.getValue().contains("bounded=1&viewbox="));
    assertTrue(query.getValue().contains("limit=10"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void onlyThaiPlacesWithinRadiusAreReturnedInDistanceOrder() throws Exception {
    var input =
        List.of(
            place("Far", 13.95, 100.325, "th", Map.of()),
            place("Near", 13.981, 100.325, "th", Map.of("phone", "+66 2 123 4567")),
            place("Wrong country", 13.981, 100.325, "sg", Map.of()),
            place("Outside radius", 15.0, 100.325, "th", Map.of()));
    var response =
        (Map<String, Object>)
            service(mock(GeocodingController.class)).results(input, 13.98, 100.325, 5);
    var places = (List<Map<String, Object>>) response.get("places");
    assertEquals(2, places.size());
    assertEquals("Near", places.getFirst().get("name"));
    assertEquals(List.of("+6621234567"), places.getFirst().get("phones"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void directTelephoneUsesOfficialSourceWhenAvailable() throws Exception {
    var response =
        (Map<String, Object>)
            service(mock(GeocodingController.class))
                .results(
                    List.of(place("โรงพยาบาลไทรน้อย", 13.9821, 100.3259, "th", Map.of())),
                    13.9821,
                    100.3259,
                    5);
    var places = (List<Map<String, Object>>) response.get("places");
    assertEquals(List.of("025971131", "025971132"), places.getFirst().get("phones"));
    assertTrue(
        places
            .getFirst()
            .get("phoneSourceUrl")
            .toString()
            .startsWith("https://sainoihos.moph.go.th/"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void verifiedDirectoryAddsNearbyDirectContactsMissingFromProvider() throws Exception {
    var provider = mock(GeocodingController.class);
    when(provider.call(anyString())).thenReturn(List.of());
    var result = (Map<String, Object>) service(provider).nearby(13.9821, 100.3259, "police", 5);
    var places = (List<Map<String, Object>>) result.get("places");
    assertTrue(
        places.stream()
            .anyMatch(
                p ->
                    p.get("name").equals("สถานีตำรวจภูธรไทรน้อย")
                        && !((List<?>) p.get("phones")).isEmpty()));
  }

  @Test
  @SuppressWarnings("unchecked")
  void policeResultsExcludeImmigrationAndForensicOffices() throws Exception {
    var input =
        List.<Map<String, Object>>of(
            Map.of("name", "Immigration for Covid Extension", "distanceMeters", 100),
            Map.of("name", "Police Forensic Science", "distanceMeters", 200),
            Map.of("name", "Police Station", "distanceMeters", 300));
    var response =
        service(mock(GeocodingController.class))
            .withDirectory(Map.of("places", input), 13.75, 100.5, 5, "police");
    var places = (List<Map<String, Object>>) response.get("places");
    assertEquals(1, places.size());
    assertEquals("Police Station", places.getFirst().get("name"));
  }

  @Test
  void providerFailureReturnsServiceUnavailable() throws Exception {
    var provider = mock(GeocodingController.class);
    when(provider.call(anyString())).thenThrow(new java.io.IOException("Unavailable"));
    var error =
        assertThrows(
            ResponseStatusException.class,
            () -> service(provider).nearby(13.98, 100.325, "hospital", 5));
    assertEquals(503, error.getStatusCode().value());
  }

  @Test
  @SuppressWarnings("unchecked")
  void fiftyKilometresIsAcceptedAndResultsRemainBoundedAndNearestFirst() throws Exception {
    var provider = mock(GeocodingController.class);
    when(provider.call(anyString()))
        .thenReturn(
            List.of(
                place("Far inside", 16.40, 100.0, "th", Map.of()),
                place("Near", 16.01, 100.0, "th", Map.of()),
                place("Outside fifty", 16.50, 100.0, "th", Map.of())));
    var result = (Map<String, Object>) service(provider).nearby(16.0, 100.0, "clinic", 50);
    var places = (List<Map<String, Object>>) result.get("places");
    assertEquals(50, result.get("radiusKm"));
    assertEquals(List.of("Near", "Far inside"), places.stream().map(p -> p.get("name")).toList());
    assertTrue(
        places.stream().allMatch(p -> ((Number) p.get("distanceMeters")).doubleValue() <= 50_000));
    assertThrows(
        ResponseStatusException.class, () -> service(provider).nearby(16, 100, "clinic", 51));
  }

  @Test
  void onlySafePhoneLinksAndWebsitesAreExposed() {
    assertEquals(
        List.of("025971131", "+6625971132"),
        EmergencyContactsController.phones(
            "02-597-1131; +66 (0) 2 597 1132; javascript:alert(1); not-a-number"));
    assertTrue(EmergencyContactsController.phones("02 5971131-2").isEmpty());
    assertEquals("", EmergencyContactsController.safeWebsite("javascript:alert(1)"));
    assertEquals("", EmergencyContactsController.safeWebsite("relative/path"));
    assertEquals(
        "https://example.org/", EmergencyContactsController.safeWebsite("https://example.org/"));
  }
}
