package th.go.towntrack;
import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Service
public class MapboxGeocoding {
 final String token; final ObjectMapper json;
 final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
 MapboxGeocoding(@Value("${MAPBOX_GEOCODING_TOKEN:}") String token,ObjectMapper json){this.token=token;this.json=json;}
 boolean enabled(){return !token.isBlank();}
 List<Map<String,Object>> lookup(String query)throws Exception{
  var uri=URI.create("https://api.mapbox.com/search/geocode/v6/"+query+"&country=th&language=th&permanent=true&access_token="+URLEncoder.encode(token,java.nio.charset.StandardCharsets.UTF_8));
  var response=client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).GET().build(),HttpResponse.BodyHandlers.ofString());
  if(response.statusCode()!=200)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Mapbox ไม่พร้อม กรุณาปักหมุดหรือกรอกที่อยู่เอง");
  List<Map<String,Object>> result=new ArrayList<>();
  for(var f:json.readTree(response.body()).path("features")){
   var p=f.path("properties");var coordinates=f.path("geometry").path("coordinates");
   if(coordinates.size()<2)continue;
   result.add(Map.of("place_id",p.path("mapbox_id").asText(),"display_name",p.path("full_address").asText(p.path("name").asText()),"lat",coordinates.get(1).asDouble(),"lon",coordinates.get(0).asDouble(),"address",Map.of("country_code","th")));
  }
  return result;
 }
}
