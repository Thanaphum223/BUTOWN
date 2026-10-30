package th.go.towntrack;

public interface GovCenterPort {
  record ExternalIdentity(String provider, String subject, String municipalityReference) {}

  ExternalIdentity resolveIdentity(String authorizationCode);

  String synchronizeComplaint(java.util.UUID localComplaintId);
}
