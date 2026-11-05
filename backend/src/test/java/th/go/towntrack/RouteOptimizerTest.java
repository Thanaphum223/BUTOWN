package th.go.towntrack;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class RouteOptimizerTest {
  @Test
  void directedRoadCostsChooseDifferentOpenAndClosedOrders() {
    double[][] m = {{0, 1, 20, 9}, {1, 0, 1, 9}, {1, 9, 0, 1}, {100, 1, 9, 0}};
    assertEquals(List.of(1, 2, 3), RouteOptimizer.order(m, false));
    assertEquals(List.of(3, 1, 2), RouteOptimizer.order(m, true));
  }

  @Test
  void unreachableJobsOrInvalidMatricesDoNotProduceInventedRoutes() {
    assertThrows(
        IllegalArgumentException.class,
        () ->
            RouteOptimizer.order(
                new double[][] {
                  {0, 1, Double.POSITIVE_INFINITY}, {1, 0, Double.POSITIVE_INFINITY}, {1, 1, 0}
                },
                false));
    assertThrows(
        IllegalArgumentException.class,
        () -> RouteOptimizer.order(new double[][] {{0, -1, 2}, {1, 0, 1}, {1, 1, 0}}, true));
    assertThrows(
        IllegalArgumentException.class, () -> RouteOptimizer.order(new double[12][12], false));
  }

  @Test
  void boundedOptimizerMatchesExhaustiveDirectedPermutations() {
    var random = new Random(20261105);
    for (int jobs = 2; jobs <= 7; jobs++)
      for (boolean loop : List.of(false, true))
        for (int trial = 0; trial < 5; trial++) {
          double[][] m = new double[jobs + 1][jobs + 1];
          for (int i = 0; i <= jobs; i++)
            for (int j = 0; j <= jobs; j++) m[i][j] = i == j ? 0 : 1 + random.nextInt(100);
          var order = RouteOptimizer.order(m, loop);
          assertEquals(jobs, new HashSet<>(order).size());
          assertFalse(order.contains(0));
          assertEquals(
              best(m, loop, new ArrayList<>(), new boolean[jobs + 1]),
              cost(m, loop, order),
              0.00001);
        }
  }

  double best(double[][] m, boolean loop, List<Integer> path, boolean[] seen) {
    if (path.size() == m.length - 1) return cost(m, loop, path);
    double best = Double.POSITIVE_INFINITY;
    for (int j = 1; j < m.length; j++)
      if (!seen[j]) {
        seen[j] = true;
        path.add(j);
        best = Math.min(best, best(m, loop, path, seen));
        path.removeLast();
        seen[j] = false;
      }
    return best;
  }

  double cost(double[][] m, boolean loop, List<Integer> path) {
    int at = 0;
    double cost = 0;
    for (int j : path) {
      cost += m[at][j];
      at = j;
    }
    return cost + (loop ? m[at][0] : 0);
  }
}
