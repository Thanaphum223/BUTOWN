package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest @AutoConfigureMockMvc @Transactional
class GovCenterSsoIntegrationTest {
 static final UUID TOWN=UUID.fromString("a4173016-49b9-41b1-8184-684397347012");
 static final String STATE="1234567890abcdef".repeat(4);
 static final AtomicReference<String> payload=new AtomicReference<>(), sentCode=new AtomicReference<>(), sentKey=new AtomicReference<>();
 static final AtomicReference<Runnable> beforeReply=new AtomicReference<>(()->{});
 static final AtomicInteger calls=new AtomicInteger(), replyStatus=new AtomicInteger(200);
 static final HttpServer iam;
 static { try {
  iam=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  iam.createContext("/e-services/sso/verify-code",e->{calls.incrementAndGet();sentCode.set(new String(e.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));sentKey.set(e.getRequestHeaders().getFirst("x-api-key"));byte[] bytes=payload.get().getBytes(StandardCharsets.UTF_8);beforeReply.get().run();e.sendResponseHeaders(replyStatus.get(),bytes.length);e.getResponseBody().write(bytes);e.close();});iam.start();
 }catch(Exception e){throw new ExceptionInInitializerError(e);} }
 @DynamicPropertySource static void config(DynamicPropertyRegistry r){
  r.add("IAM_API_URL",()->"http://127.0.0.1:"+iam.getAddress().getPort());
  r.add("IAM_GOV_FRONTEND_URL",()->"https://auth.govcenter.co");r.add("E_SERVICE_CODE",()->"towntrack-test");
  r.add("E_SERVICE_API_KEY",()->"isolated-provider-test-key");r.add("GOV_CALLBACK_URL",()->"https://towntrack.test/auth/callback");r.add("GOV_MUNICIPALITY_ID",TOWN::toString);
 }
 @Autowired MockMvc mvc;@Autowired Db db;@Autowired ObjectMapper json;
 @Autowired org.springframework.security.core.session.SessionRegistry sessions;
 @Test void authenticatedUserCanReadOnlyOwnLatestIamProfile()throws Exception{
  mvc.perform(get("/api/auth/gov-profile")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/auth/gov-profile").with(user("sso-local-admin").roles("ADMIN")))
   .andExpect(status().isOk()).andExpect(jsonPath("$.linked").value(false));
  var s=start("LOGIN",false);callback(s,STATE,"profile",false).andExpect(status().isOk());
  mvc.perform(get("/api/auth/gov-profile").session(s)).andExpect(status().isOk())
   .andExpect(jsonPath("$.linked").value(true)).andExpect(jsonPath("$.profile.name").value("SSO Citizen"))
   .andExpect(jsonPath("$.profile.email").value("same-name@example.test")).andExpect(jsonPath("$.residences").isEmpty())
   .andExpect(jsonPath("$.apiKey").doesNotExist());
  payload.set("{\"user\":{\"id\":\"iam-citizen-1\",\"name\":\"Updated IAM name\",\"email\":\"updated@example.test\"},\"residences\":[]}");
  var next=start("LOGIN",false);callback(next,STATE,"updated",false).andExpect(status().isOk());
  mvc.perform(get("/api/auth/gov-profile").session(next)).andExpect(jsonPath("$.profile.name").value("Updated IAM name"));
  mvc.perform(get("/api/auth/gov-profile").with(user("sso-local-admin").roles("ADMIN")))
   .andExpect(jsonPath("$.linked").value(false)).andExpect(jsonPath("$.profile").doesNotExist());
 }
 @Test void sixthSsoLoginExpiresOldestSession()throws Exception{
  var first=start("LOGIN",false);callback(first,STATE,"first",false).andExpect(status().isOk());
  String firstId=first.getId();
  for(int i=0;i<5;i++)callback(start("LOGIN",false),STATE,"next-"+i,false).andExpect(status().isOk());
  assertTrue(sessions.getSessionInformation(firstId).isExpired());
 }
 @Test void changingRoleRevokesExistingSsoSession()throws Exception{
  var s=start("LOGIN",false);callback(s,STATE,"before-promotion",false).andExpect(status().isOk());
  var account=db.one("SELECT local_user_id FROM iam_user_profile WHERE municipality_id=?",TOWN);
  mvc.perform(post("/api/admin/users/"+account.get("local_user_id")+"/role")
   .with(user("sso-local-admin").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
   .content(json.writeValueAsString(Map.of("role","OFFICER","departmentId",dept))))
   .andExpect(status().isOk());
  assertTrue(sessions.getSessionInformation(s.getId()).isExpired());
 }
 @Test void transportRejectionIsNotReportedAsInvalidUserCode()throws Exception{
  replyStatus.set(403);payload.set("error code: 1010");
  callback(start("LOGIN",false),STATE,"unused-code",false).andExpect(status().isServiceUnavailable());
  assertEquals(1,calls.get());
 }
 @Test void disablingAccountRevokesExistingSsoSession()throws Exception{
  var s=start("LOGIN",false);callback(s,STATE,"before-disable",false).andExpect(status().isOk());
  var account=db.one("SELECT local_user_id FROM iam_user_profile WHERE municipality_id=?",TOWN);
  mvc.perform(post("/api/admin/users/"+account.get("local_user_id")+"/enabled")
   .with(user("sso-local-admin").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
   .content("{\"enabled\":false}")).andExpect(status().isOk());
  assertTrue(sessions.getSessionInformation(s.getId()).isExpired());
 }
 @Test void knownUsedCodeStillRequiresFreshLogin()throws Exception{
  replyStatus.set(403);payload.set("{\"message\":\"SSO code has already been used\"}");
  callback(start("LOGIN",false),STATE,"used-code",false).andExpect(status().isUnauthorized());
  assertEquals(1,calls.get());
 }
 @Test void reuseCreatesVerifiedLocalSessionButCannotReplaceAnAuthenticatedAccount()throws Exception{
  var s=start("REUSE",false);callback(s,STATE,"central-reuse-code",false).andExpect(status().isOk());
  mvc.perform(get("/api/auth/me").session(s)).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("CITIZEN"));
  int before=calls.get();var pending=start("REUSE",false);
  callback(pending,STATE,"do-not-exchange",true).andExpect(status().isConflict());assertEquals(before,calls.get());
 }
 @Test void delayedExchangeCannotRestoreLoggedOutSession()throws Exception{
  var s=start("LOGIN",false);beforeReply.set(s::invalidate);
  callback(s,STATE,"delayed-logout",false).andExpect(status().isConflict());
  assertEquals(0L,((Number)db.one("SELECT count(*) n FROM iam_user_profile WHERE municipality_id=?",TOWN).get("n")).longValue());
 }
 @Test void delayedExchangeCannotReplaceRotatedLocalLogin()throws Exception{
  var s=start("LOGIN",false);beforeReply.set(s::changeSessionId);
  callback(s,STATE,"delayed-local-login",false).andExpect(status().isConflict());
  assertEquals(0L,((Number)db.one("SELECT count(*) n FROM iam_user_profile WHERE municipality_id=?",TOWN).get("n")).longValue());
 }
 @Test void logoutWaitsForFinalContextSaveAndLeavesNoAuthenticatedSession()throws Exception{
  var logout=new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.CompletableFuture<MvcResult>>();
  var session=new MockHttpSession(){
   @Override public void setAttribute(String name,Object value){
    super.setAttribute(name,value);
    if(name.equals("gov_verified_until")){
     var entered=new java.util.concurrent.CountDownLatch(1);
     logout.set(java.util.concurrent.CompletableFuture.supplyAsync(()->{
      entered.countDown();
      try{return mvc.perform(post("/api/auth/logout").session(this).with(csrf())).andReturn();}
      catch(Exception e){throw new RuntimeException(e);}
     }));
     try{assertTrue(entered.await(2,java.util.concurrent.TimeUnit.SECONDS));}
     catch(InterruptedException e){throw new RuntimeException(e);}
     assertThrows(java.util.concurrent.TimeoutException.class,()->logout.get().get(150,java.util.concurrent.TimeUnit.MILLISECONDS));
    }
   }
  };
  mvc.perform(post("/api/auth/gov/start").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
    .content(json.writeValueAsString(Map.of("state",STATE,"purpose","LOGIN")))).andExpect(status().isOk());
  var result=callback(session,STATE,"finalize-logout",false).andExpect(status().isOk()).andReturn();
  assertEquals(204,logout.get().get(3,java.util.concurrent.TimeUnit.SECONDS).getResponse().getStatus());
  assertTrue(session.isInvalid());assertNull(result.getRequest().getSession(false));
 }
 UUID admin,dept;String address;static final AtomicInteger addresses=new AtomicInteger();
 @BeforeEach void setup()throws Exception{
  beforeReply.set(()->{});address="192.0.2."+addresses.incrementAndGet();calls.set(0);replyStatus.set(200);payload.set(json.writeValueAsString(Map.of("user",Map.of("id","iam-citizen-1","name","SSO Citizen","email","same-name@example.test","role","ADMIN","memberships",List.of()),"residences",List.of())));
  db.run("INSERT INTO municipality(id,name) VALUES(?,'SSO test town')",TOWN);dept=UUID.randomUUID();admin=UUID.randomUUID();
  db.run("INSERT INTO department(id,municipality_id,name) VALUES(?,?,'Engineering')",dept,TOWN);
  db.run("INSERT INTO app_user(id,municipality_id,department_id,username,password_hash,display_name,role) VALUES(?,?,?,'sso-local-admin','unchanged-password-hash','Existing administrator','ADMIN')",admin,TOWN,dept);
 }
 MockHttpSession start(String purpose,boolean loggedIn)throws Exception{
  var s=new MockHttpSession();var request=post("/api/auth/gov/start").session(s).with(r->{r.setRemoteAddr(address);return r;}).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("state",STATE,"purpose",purpose)));
  if(loggedIn)request.with(user("sso-local-admin").roles("ADMIN"));
  mvc.perform(request).andExpect(status().isOk());return s;
 }
 ResultActions callback(MockHttpSession s,String state,String code,boolean loggedIn)throws Exception{
  var request=post("/api/auth/sso-callback").session(s).with(r->{r.setRemoteAddr(address);return r;}).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("state",state,"code",code)));
  if(loggedIn)request.with(user("sso-local-admin").roles("ADMIN"));
  return mvc.perform(request);
 }
 @Test void publicConfigExposesOnlyPublicFields()throws Exception{
  mvc.perform(get("/api/public/gov-auth")).andExpect(status().isOk()).andExpect(jsonPath("$.configured").value(true)).andExpect(jsonPath("$.serviceCode").value("towntrack-test")).andExpect(jsonPath("$.apiKey").doesNotExist());
 }
 @Test void exchangesTrimmedCodeOnceAndCreatesCitizenRegardlessOfIamAdminRole()throws Exception{
  var s=start("LOGIN",false);callback(s,STATE,"  one-use-code  ",false).andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true)).andExpect(jsonPath("$.user.role").value("CITIZEN"));
  assertEquals("one-use-code",json.readTree(sentCode.get()).path("code").asText());assertEquals("isolated-provider-test-key",sentKey.get());assertEquals(1,calls.get());
  var binding=db.one("SELECT p.local_user_id,u.role FROM iam_user_profile p JOIN app_user u ON u.id=p.local_user_id WHERE p.iam_user_id='iam-citizen-1' AND p.municipality_id=?",TOWN);
  assertEquals("CITIZEN",binding.get("role"));assertNotEquals(admin,binding.get("local_user_id"));
  callback(s,STATE,"one-use-code",false).andExpect(status().is4xxClientError());assertEquals(1,calls.get());
 }
 @Test void invalidOrMissingStateCannotCallProvider()throws Exception{
  callback(new MockHttpSession(),STATE,"code",false).andExpect(status().is4xxClientError());
  callback(start("LOGIN",false),"", "code",false).andExpect(status().is4xxClientError());
  callback(start("LOGIN",false),"a".repeat(64),"code",false).andExpect(status().is4xxClientError());
  assertEquals(0,calls.get());
 }
 @Test void linkingPreservesLocalCredentialsRoleDepartmentAndSubsequentLogin()throws Exception{
  callback(start("LINK",true),STATE,"link-code",true).andExpect(status().isOk()).andExpect(jsonPath("$.user.role").value("ADMIN"));
  var row=db.one("SELECT role,password_hash,department_id FROM app_user WHERE id=?",admin);
  assertEquals("ADMIN",row.get("role"));assertEquals("unchanged-password-hash",row.get("password_hash"));assertEquals(dept,row.get("department_id"));
  callback(start("LOGIN",false),STATE,"fresh-code",false).andExpect(status().isOk()).andExpect(jsonPath("$.user.role").value("ADMIN"));
 }
 @Test void linkRequiresAuthenticatedAccountAndRejectsDisabledIdentity()throws Exception{
  mvc.perform(post("/api/auth/gov/start").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("state",STATE,"purpose","LINK")))).andExpect(status().isUnauthorized());
  callback(start("LINK",true),STATE,"link",true).andExpect(status().isOk());db.run("UPDATE app_user SET enabled=false WHERE id=?",admin);
  callback(start("LOGIN",false),STATE,"again",false).andExpect(status().isForbidden());
 }
 @Test void invalidProviderDataAndProviderFailureDoNotAuthenticateOrRetry()throws Exception{
  payload.set("{\"user\":{\"role\":\"ADMIN\"},\"residences\":[]}");callback(start("LOGIN",false),STATE,"bad",false).andExpect(status().isBadGateway());
  assertEquals(0L,((Number)db.one("SELECT count(*) n FROM iam_user_profile WHERE municipality_id=?",TOWN).get("n")).longValue());
  replyStatus.set(503);callback(start("LOGIN",false),STATE,"bad",false).andExpect(status().isServiceUnavailable());assertEquals(2,calls.get());
 }
 @Test void residenceMembershipSyncRemovesStaleLinksAndKeepsPendingUnverified()throws Exception{
  var residence=Map.of("membershipId","membership-1","role","OWNER","status","PENDING","addressSnapshot",Map.of("residenceId","residence-1","formattedAddress","Fictional test address","status","VERIFIED","municipalityId","external-town"),"residence",Map.of("status","VERIFIED"));
  payload.set(json.writeValueAsString(Map.of("user",Map.of("id","iam-citizen-1","name","Citizen"),"residences",List.of(residence))));
  var own=start("LOGIN",false);callback(own,STATE,"first",false).andExpect(status().isOk());
  mvc.perform(get("/api/auth/gov-profile").session(own)).andExpect(status().isOk())
   .andExpect(jsonPath("$.residences[0].address").value("Fictional test address"))
   .andExpect(jsonPath("$.residences[0].canUseForOfficialTransaction").value(false));
  var row=db.one("SELECT member_status,residence_status FROM iam_user_residence WHERE municipality_id=?",TOWN);assertEquals("PENDING",row.get("member_status"));assertEquals("VERIFIED",row.get("residence_status"));
  payload.set("{\"user\":{\"id\":\"iam-citizen-1\",\"name\":\"Citizen\"},\"residences\":[]}");callback(start("LOGIN",false),STATE,"next",false).andExpect(status().isOk());assertEquals(0L,((Number)db.one("SELECT count(*) n FROM iam_user_residence WHERE municipality_id=?",TOWN).get("n")).longValue());
 }
 @Test void expiredStateAndChangedLinkAccountCannotExchangeCode()throws Exception{
  var expired=start("LOGIN",false);expired.setAttribute(CentralGovAuthController.PENDING,new CentralGovAuthController.Pending(STATE,java.time.Instant.now().minusSeconds(1),null));callback(expired,STATE,"code",false).andExpect(status().isBadRequest());
  var linking=start("LINK",true);linking.removeAttribute("SPRING_SECURITY_CONTEXT");callback(linking,STATE,"code",false).andExpect(status().isUnauthorized());assertEquals(0,calls.get());
 }
 @Test void stateRegistrationRequiresCsrfAndRejectsNullPurpose()throws Exception{
  mvc.perform(post("/api/auth/gov/start").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("state",STATE,"purpose","LOGIN")))).andExpect(status().isForbidden());
  mvc.perform(post("/api/auth/gov/start").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"state\":\""+STATE+"\",\"purpose\":null}")).andExpect(status().isBadRequest());
 }
 @Test void malformedProviderJsonFailsAsBadGateway()throws Exception{
  payload.set("not-json");callback(start("LOGIN",false),STATE,"code",false).andExpect(status().isBadGateway());
 }
 @Test void sameIamIdentityCannotBeClaimedByDifferentLocalAccount()throws Exception{
  callback(start("LOGIN",false),STATE,"first",false).andExpect(status().isOk());
  callback(start("LINK",true),STATE,"steal",true).andExpect(status().isConflict());
  assertNotEquals(admin,db.one("SELECT local_user_id FROM iam_user_profile WHERE municipality_id=?",TOWN).get("local_user_id"));
 }

}
