package th.go.towntrack;

import java.util.*;

/**
 * Exact bounded ordering using directed driving durations, with a fixed starting point (index 0).
 */
final class RouteOptimizer {
  static List<Integer> order(double[][] matrix, boolean loop) {
    if (matrix == null || matrix.length < 3 || matrix.length > 11)
      throw new IllegalArgumentException("เลือกรายการงาน 2–10 จุด");
    int jobs = matrix.length - 1, states = 1 << jobs;
    for (var row : matrix) {
      if (row == null || row.length != jobs + 1)
        throw new IllegalArgumentException("ตารางระยะทางไม่ครบ");
      for (double value : row)
        if (Double.isNaN(value) || value < 0)
          throw new IllegalArgumentException("ระยะทางไม่ถูกต้อง");
    }
    double[][] cost = new double[states][jobs];
    int[][] previous = new int[states][jobs];
    for (int mask = 0; mask < states; mask++) {
      Arrays.fill(cost[mask], Double.POSITIVE_INFINITY);
      Arrays.fill(previous[mask], -1);
    }
    for (int j = 0; j < jobs; j++) cost[1 << j][j] = matrix[0][j + 1];
    for (int mask = 1; mask < states; mask++)
      for (int last = 0; last < jobs; last++) {
        if ((mask & (1 << last)) == 0 || !Double.isFinite(cost[mask][last])) continue;
        for (int next = 0; next < jobs; next++) {
          if ((mask & (1 << next)) != 0) continue;
          int extended = mask | (1 << next);
          double candidate = cost[mask][last] + matrix[last + 1][next + 1];
          if (candidate < cost[extended][next]) {
            cost[extended][next] = candidate;
            previous[extended][next] = last;
          }
        }
      }
    int mask = states - 1, last = -1;
    double best = Double.POSITIVE_INFINITY;
    for (int j = 0; j < jobs; j++) {
      double total = cost[mask][j] + (loop ? matrix[j + 1][0] : 0);
      if (total < best) {
        best = total;
        last = j;
      }
    }
    if (last < 0)
      throw new IllegalArgumentException(
          "ไม่พบเส้นทางถนนที่เชื่อมงานครบทุกจุด กรุณาตรวจหมุดหรือแยกรอบ");
    var order = new ArrayList<Integer>();
    while (last >= 0) {
      order.add(last + 1);
      int prior = previous[mask][last];
      mask ^= 1 << last;
      last = prior;
    }
    Collections.reverse(order);
    return List.copyOf(order);
  }
}
