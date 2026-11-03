package th.go.towntrack;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
class CentralGovAuthTest {
 @Test void absentCredentialsAndUnsafeUrlsFailClosed(){
  var missing=new GovCenterSsoClient(new ObjectMapper(),"local","https://api-auth.govcenter.co","https://auth.govcenter.co","","","","");
  assertFalse(missing.configured());assertThrows(org.springframework.web.server.ResponseStatusException.class,()->missing.verify("code"));
  var unsafe=new GovCenterSsoClient(new ObjectMapper(),"central","http://evil.example","https://auth.govcenter.co","test","secret","https://towntrack.test/auth/callback",java.util.UUID.randomUUID().toString());assertFalse(unsafe.configured());
 }
}
