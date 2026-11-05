package th.go.towntrack;

import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/route-plans")
public class RoutePlanningController {
  final RoutePlanning routes;
  final Access access;
  final SubmissionKeys keys;

  RoutePlanningController(RoutePlanning routes, Access access, SubmissionKeys keys) {
    this.routes = routes;
    this.access = access;
    this.keys = keys;
  }

  @GetMapping("/candidates")
  Object candidates(Authentication auth) {
    return routes.candidates(access.user(auth));
  }

  @GetMapping
  Object list(Authentication auth) {
    return routes.list(access.user(auth));
  }

  @GetMapping("/{id}")
  Object detail(@PathVariable UUID id, Authentication auth) {
    return routes.detail(id, access.user(auth));
  }

  @PostMapping("/calculate")
  @Transactional
  Object calculate(
      @RequestBody Map<String, Object> body,
      Authentication auth,
      @RequestHeader(value = "Idempotency-Key", required = false) UUID key)
      throws Exception {
    var user = access.user(auth);
    access.role(user, "OFFICER", "LEADER");
    String hash = keys.hash(body);
    var prior = keys.find(user.get("id"), "ROUTE:CALCULATE", key, hash);
    if (prior != null) {
      routes.plan(Db.id(((Map<?, ?>) prior).get("id")), user, false);
      return prior;
    }
    var result = routes.calculate(body, user);
    keys.save(user.get("id"), "ROUTE:CALCULATE", key, hash, result);
    return result;
  }

  @PostMapping("/{id}/{action}")
  @Transactional
  Object change(
      @PathVariable UUID id,
      @PathVariable String action,
      @RequestBody Map<String, Object> body,
      Authentication auth,
      @RequestHeader(value = "Idempotency-Key", required = false) UUID key)
      throws Exception {
    var user = access.user(auth);
    access.role(user, "OFFICER", "LEADER");
    String operation = "ROUTE:" + id + ":" + action, hash = keys.hash(body);
    var prior = keys.find(user.get("id"), operation, key, hash);
    if (prior != null) {
      routes.plan(id, user, false);
      return prior;
    }
    var result = routes.change(id, action, body, user);
    keys.save(user.get("id"), operation, key, hash, result);
    return result;
  }
}
