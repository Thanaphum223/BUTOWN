package th.go.towntrack;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.User;
import org.springframework.web.server.ResponseStatusException;
class CentralGovAuthTest {
 @Test void validatesAudienceExpiryProvisionedRoleAndServiceFailure()throws Exception{
  Db db=mock(Db.class);UserDetailsService users=mock(UserDetailsService.class);var json=new ObjectMapper();
  when(db.list(anyString(),any(),any())).thenReturn(List.of(Map.of("username","staff","role","OFFICER")));
  when(users.loadUserByUsername("staff")).thenReturn(User.withUsername("staff").password("unused").roles("OFFICER").build());
  var claims=new HashMap<String,Object>();claims.put("active",true);claims.put("exp",Instant.now().plusSeconds(1000).getEpochSecond());claims.put("aud","towntrack");claims.put("sub","subject");claims.put("municipality_reference","T1");claims.put("roles",List.of("OFFICER"));
  AtomicReference<String> payload=new AtomicReference<>(json.writeValueAsString(claims));
  HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  server.createContext("/introspect",e->{byte[] data=payload.get().getBytes(java.nio.charset.StandardCharsets.UTF_8);e.sendResponseHeaders(200,data.length);e.getResponseBody().write(data);e.close();});server.start();
  var controller=new CentralGovAuthController(db,json,users,"central","http://127.0.0.1:"+server.getAddress().getPort()+"/introspect","client","secret","towntrack");
  try{
   var request=new MockHttpServletRequest();controller.login(Map.of("accessToken","test-token"),request,new MockHttpServletResponse());assertNotNull(request.getSession().getAttribute("gov_verified_until"));
   claims.put("aud","other");payload.set(json.writeValueAsString(claims));assertEquals(403,assertThrows(ResponseStatusException.class,()->controller.login(Map.of("accessToken","test-token"),new MockHttpServletRequest(),new MockHttpServletResponse())).getStatusCode().value());
   claims.put("aud","towntrack");claims.put("exp",1);payload.set(json.writeValueAsString(claims));assertEquals(401,assertThrows(ResponseStatusException.class,()->controller.login(Map.of("accessToken","test-token"),new MockHttpServletRequest(),new MockHttpServletResponse())).getStatusCode().value());
   claims.put("exp",Instant.now().plusSeconds(1000).getEpochSecond());claims.put("roles",List.of("ADMIN"));payload.set(json.writeValueAsString(claims));assertEquals(403,assertThrows(ResponseStatusException.class,()->controller.login(Map.of("accessToken","test-token"),new MockHttpServletRequest(),new MockHttpServletResponse())).getStatusCode().value());
  }finally{server.stop(0);SecurityContextHolder.clearContext();}
  assertEquals(503,assertThrows(ResponseStatusException.class,()->controller.login(Map.of("accessToken","test-token"),new MockHttpServletRequest(),new MockHttpServletResponse())).getStatusCode().value());
 }
 @Test void missingCentralConfigurationFailsClosed(){
  var controller=new CentralGovAuthController(mock(Db.class),new ObjectMapper(),mock(UserDetailsService.class),"central","","","","towntrack");
  assertEquals(503,assertThrows(ResponseStatusException.class,()->controller.login(Map.of("accessToken","test"),new MockHttpServletRequest(),new MockHttpServletResponse())).getStatusCode().value());
 }
}
