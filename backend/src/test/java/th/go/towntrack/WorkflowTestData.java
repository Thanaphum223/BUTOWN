package th.go.towntrack;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

import java.util.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

/** Shared inputs that the field workflow now requires before START and REQUEST_RESOURCE. */
final class WorkflowTestData {
  static final List<Map<String, Object>> REQUESTED_ITEMS =
      List.of(Map.of("name", "Test materials", "quantity", 2, "unit", "pieces"));

  private WorkflowTestData() {}

  static MockMultipartHttpServletRequestBuilder startPhoto(UUID complaintId) throws Exception {
    var image = new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
    var bytes = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", bytes);
    return (MockMultipartHttpServletRequestBuilder)
        multipart("/api/complaints/" + complaintId + "/files")
            .file(new MockMultipartFile("file", "start.png", "image/png", bytes.toByteArray()))
            .param("evidenceStage", "BEFORE");
  }

  static Map<String, Object> withDefaults(String action, Map<String, ?> values) {
    var body = new LinkedHashMap<String, Object>(values);
    if (action.equals("REQUEST_RESOURCE")) body.putIfAbsent("items", REQUESTED_ITEMS);
    return body;
  }
}
