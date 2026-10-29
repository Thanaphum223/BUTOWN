package th.go.towntrack;

/**
 * Integration boundary. Implement only after GovCenter supplies an approved API/SSO contract. No
 * endpoints, tokens, or identity mappings are guessed.
 */
public interface GovCenterPort {
  record ExternalIdentity(String provider, String subject, String municipalityReference) {}

  ExternalIdentity resolveIdentity(String authorizationCode);

  String synchronizeComplaint(java.util.UUID localComplaintId);
}
