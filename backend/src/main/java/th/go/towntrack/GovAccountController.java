package th.go.towntrack;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class GovAccountController {
  final GovAccountClient api;
  final CentralGovAuthController central;

  public GovAccountController(GovAccountClient api, CentralGovAuthController central) {
    this.api = api;
    this.central = central;
  }

  record Registration(
      @NotNull @Pattern(regexp = "[a-f0-9]{64}") String state,
      @NotBlank @Size(min = 2, max = 200) String name,
      @NotBlank @Email @Size(max = 320) String email,
      @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) @NotNull @Size(min = 12, max = 72)
          String password) {
    Registration {
      name = clean(name);
      email = cleanEmail(email);
    }

    @Override
    public String toString() {
      return "GovRegistration[redacted]";
    }
  }

  record PasswordLogin(
      @NotNull @Pattern(regexp = "[a-f0-9]{64}") String state,
      @NotBlank @Email @Size(max = 320) String email,
      @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) @NotNull @Size(min = 1, max = 72)
          String password) {
    PasswordLogin {
      email = cleanEmail(email);
    }

    @Override
    public String toString() {
      return "GovPasswordLogin[redacted]";
    }
  }

  static String clean(String value) {
    return value == null ? null : value.trim();
  }

  static String cleanEmail(String value) {
    return value == null ? null : value.trim().toLowerCase(Locale.ROOT);
  }

  @PostMapping("/api/auth/gov/register")
  Object register(
      @Valid @RequestBody Registration data,
      HttpServletRequest request,
      HttpServletResponse response,
      Authentication auth) {
    if (CentralGovAuthController.signedIn(auth)) throw CentralGovAuthController.changedSession();
    var exchange = central.consume(request, data.state(), List.of("REGISTER"));
    api.register(data.name(), data.email(), data.password());
    try {
      return finish(exchange, data.email(), data.password(), request, response);
    } catch (ResponseStatusException e) {
      throw new ResponseStatusException(
          e.getStatusCode(),
          "สมัครบัญชี Gov Center สำเร็จแล้ว แต่ยังเข้า TownTrack ไม่สำเร็จ — " + e.getReason());
    }
  }

  @PostMapping("/api/auth/gov/password-login")
  Object login(
      @Valid @RequestBody PasswordLogin data,
      HttpServletRequest request,
      HttpServletResponse response,
      Authentication auth) {
    if (CentralGovAuthController.signedIn(auth)) throw CentralGovAuthController.changedSession();
    var exchange = central.consume(request, data.state(), List.of("PASSWORD_LOGIN"));
    return finish(exchange, data.email(), data.password(), request, response);
  }

  private Object finish(
      CentralGovAuthController.Exchange exchange,
      String email,
      String password,
      HttpServletRequest request,
      HttpServletResponse response) {
    var verified = central.client.verify(api.loginCode(email, password));
    return central.complete(exchange, verified, request, response);
  }
}
