package th.go.towntrack;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
public class MapConfigController {
  final String token;

  public MapConfigController(@Value("${MAPBOX_PUBLIC_TOKEN:}") String token) {
    if (!token.isBlank() && !token.startsWith("pk."))
      throw new IllegalArgumentException("MAPBOX_PUBLIC_TOKEN must be a restricted public token");
    this.token = token;
  }

  @GetMapping("/api/public/map-config")
  public Object config() {
    return Map.of("provider", token.isBlank() ? "local-osm" : "mapbox", "publicToken", token);
  }
}
