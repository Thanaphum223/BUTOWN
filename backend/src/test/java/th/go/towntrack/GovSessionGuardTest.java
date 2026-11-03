package th.go.towntrack;
import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
class GovSessionGuardTest {
 @AfterEach void clear(){SecurityContextHolder.clearContext();}
 @Test void anotherAccountsVerificationCannotAuthorizeStaffSession()throws Exception{
  var staff=User.withUsername("staff-account").password("unused").roles("OFFICER").build();
  SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(staff,null,staff.getAuthorities()));
  var request=new MockHttpServletRequest("GET","/api/auth/me");request.getSession().setAttribute("gov_verified_until",Instant.now().plusSeconds(1000).getEpochSecond());request.getSession().setAttribute("gov_verified_username","citizen-account");
  var response=new MockHttpServletResponse();var reached=new AtomicBoolean();
  new SecurityConfig.GovSessionGuard("central").doFilter(request,response,(q,s)->reached.set(true));
  assertFalse(reached.get());assertEquals(503,response.getStatus());
 }
 @Test void matchingVerifiedIdentityMayAccessStaffEndpoint()throws Exception{
  var staff=User.withUsername("staff-account").password("unused").roles("OFFICER").build();SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(staff,null,staff.getAuthorities()));
  var request=new MockHttpServletRequest("GET","/api/auth/me");request.getSession().setAttribute("gov_verified_until",Instant.now().plusSeconds(1000).getEpochSecond());request.getSession().setAttribute("gov_verified_username","staff-account");
  var response=new MockHttpServletResponse();var reached=new AtomicBoolean();new SecurityConfig.GovSessionGuard("central").doFilter(request,response,(q,s)->reached.set(true));assertTrue(reached.get());
 }
}
