package th.go.towntrack;

import jakarta.servlet.http.*;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.session.*;
import org.springframework.stereotype.Component;

@Component
public class ExternalLoginSessions {
  final SessionRegistry registry;
  final SessionAuthenticationStrategy strategy;

  public ExternalLoginSessions(SessionRegistry registry) {
    this.registry = registry;
    var concurrency = new ConcurrentSessionControlAuthenticationStrategy(registry);
    concurrency.setMaximumSessions(5);
    strategy = new CompositeSessionAuthenticationStrategy(List.of(concurrency,
        new ChangeSessionIdAuthenticationStrategy(), new RegisterSessionAuthenticationStrategy(registry)));
  }

  public void authenticate(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
    String oldId = request.getSession().getId();
    strategy.onAuthentication(authentication, request, response);
    if (!oldId.equals(request.getSession().getId())) registry.removeSessionInformation(oldId);
  }

  public void revoke(String username) {
    for (Object principal : registry.getAllPrincipals()) {
      if (principal instanceof UserDetails user && username.equals(user.getUsername()))
        for (var session : registry.getAllSessions(principal, false)) session.expireNow();
    }
  }
}
