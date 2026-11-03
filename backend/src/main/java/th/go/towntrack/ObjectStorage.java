package th.go.towntrack;

import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

@Service
public class ObjectStorage {
  final S3Client s3;
  final String bucket;

  ObjectStorage(
      @Value("${STORAGE_PROVIDER:local}") String provider,
      @Value("${S3_BUCKET:}") String bucket,
      @Value("${S3_REGION:ap-southeast-1}") String region,
      @Value("${S3_ENDPOINT:}") String endpoint) {
    if (!java.util.List.of("local", "s3").contains(provider))
      throw new IllegalArgumentException("STORAGE_PROVIDER");
    this.bucket = bucket;
    if (provider.equals("s3")) {
      if (bucket.isBlank()) throw new IllegalArgumentException("S3_BUCKET required");
      var builder =
          S3Client.builder()
              .region(Region.of(region))
              .credentialsProvider(DefaultCredentialsProvider.builder().build());
      if (!endpoint.isBlank()) builder.endpointOverride(URI.create(endpoint)).forcePathStyle(true);
      s3 = builder.build();
    } else s3 = null;
  }

  @jakarta.annotation.PreDestroy
  void close() {
    if (s3 != null) s3.close();
  }

  boolean enabled() {
    return s3 != null;
  }

  void put(String key, Path source, String contentType) {
    s3.putObject(
        PutObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .contentType(contentType)
            .serverSideEncryption(ServerSideEncryption.AES256)
            .build(),
        RequestBody.fromFile(source));
  }

  InputStream get(String key) {
    if (s3 == null) throw new IllegalStateException("S3 not configured");
    return s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
  }

  InputStream get(String key, long start, long end) {
    return s3.getObject(
        GetObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .range("bytes=" + start + "-" + end)
            .build());
  }

  void delete(String key) {
    s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
  }
}
