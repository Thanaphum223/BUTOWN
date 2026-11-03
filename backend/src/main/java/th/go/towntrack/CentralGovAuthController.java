package th.go.towntrack;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.*;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class CentralGovAuthController {
 @org.springframework.beans.factory.annotation.Autowired(required=false) org.springframework.security.core.session.SessionRegistry sessions;
 final Db db; final ObjectMapper json; final UserDetailsService users;
 final String mode,url,clientId,secret,audience;
 final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
 CentralGovAuthController(Db db,ObjectMapper json,UserDetailsService users,
 @Value("${GOV_AUTH_MODE:local}") String mode,@Value("${GOV_INTROSPECTION_URL:}") String url,
 @Value("${GOV_CLIENT_ID:}") String clientId,@Value("${GOV_CLIENT_SECRET:}") String secret,@Value("${GOV_AUDIENCE:towntrack}") String audience){
 this.db=db;this.json=json;this.users=users;this.mode=mode;this.url=url;this.clientId=clientId;this.secret=secret;this.audience=audience;
 if(!List.of("local","central").contains(mode))throw new IllegalArgumentException("GOV_AUTH_MODE");
 }
 @GetMapping("/api/public/gov-auth") Object config(){return Map.of("mode",mode,"configured",!url.isBlank()&&!clientId.isBlank()&&!secret.isBlank());}
 @PostMapping("/api/auth/gov") Object login(@RequestBody Map<String,String> body,HttpServletRequest request,HttpServletResponse response)throws Exception{
 if(!mode.equals("central")||url.isBlank()||clientId.isBlank()||secret.isBlank())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"ยังไม่ได้ตั้งค่า Central Gov-Auth");
 String token=body.getOrDefault("accessToken","");if(token.isBlank()||token.length()>10000)throw new IllegalArgumentException();
 com.fasterxml.jackson.databind.JsonNode claims;
 try{
 var result=http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5))
 .header("Authorization","Basic "+Base64.getEncoder().encodeToString((clientId+":"+secret).getBytes(StandardCharsets.UTF_8)))
 .header("Content-Type","application/x-www-form-urlencoded")
 .POST(HttpRequest.BodyPublishers.ofString("token="+URLEncoder.encode(token,StandardCharsets.UTF_8))).build(),HttpResponse.BodyHandlers.ofString());
 if(result.statusCode()!=200)throw new IllegalStateException();claims=json.readTree(result.body());
 }catch(Exception e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Central Gov-Auth ไม่พร้อมใช้งาน ระงับการเข้าสู่ระบบเจ้าหน้าที่ชั่วคราว");}
 long expires=claims.path("exp").asLong();
 boolean aud=claims.path("aud").isArray()?java.util.stream.StreamSupport.stream(claims.path("aud").spliterator(),false).anyMatch(x->x.asText().equals(audience)):claims.path("aud").asText().equals(audience);
 if(!claims.path("active").asBoolean()||expires<=Instant.now().getEpochSecond())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"โทเคนหมดอายุหรือไม่ถูกต้อง");
 if(!aud)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"โทเคนไม่ใช่ของ TownTrack");
 var rows=db.list("SELECT u.username,u.role FROM app_user u JOIN municipality m ON m.id=u.municipality_id WHERE u.external_id=? AND m.external_id=? AND u.enabled=true AND u.role<>'CITIZEN'","gov:"+claims.path("sub").asText(),claims.path("municipality_reference").asText());
 if(rows.size()!=1)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"ยังไม่ได้ผูกบัญชีเจ้าหน้าที่กับหน่วยงาน");
 var account=rows.getFirst(); boolean hasRole=false;
 for(var r:claims.path("roles"))if(r.asText().equals(account.get("role")))hasRole=true;
 if(!hasRole)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"บทบาทส่วนกลางไม่ตรงกับสิทธิ์ที่กำหนด");
 var user=users.loadUserByUsername(account.get("username").toString());request.getSession();if(sessions!=null)sessions.removeSessionInformation(request.getSession().getId());request.changeSessionId();if(sessions!=null)sessions.registerNewSession(request.getSession().getId(),user);
 var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(user,null,user.getAuthorities()));SecurityContextHolder.setContext(context);
 request.getSession().setAttribute("gov_verified_until",Math.min(expires,Instant.now().plusSeconds(1800).getEpochSecond()));
 new HttpSessionSecurityContextRepository().saveContext(context,request,response);
 new org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository().saveToken(null,request,response);
 return Map.of("ok",true);
 }
}
