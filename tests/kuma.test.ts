import { describe, expect, it } from "vitest";
import { parseMetrics } from "@/lib/adapters/kuma";

/**
 * Shaped after the live instance's output. Uptime Kuma emits the two series in
 * separate blocks, response times before statuses, which is why the parser
 * joins them by name after the fact rather than in one pass.
 */
const SAMPLE = `# HELP monitor_response_time Monitor Response Time (ms)
# TYPE monitor_response_time gauge
monitor_response_time{monitor_name="Jellyfin",monitor_type="http",monitor_url="http://192.168.1.200:8096"} 42
monitor_response_time{monitor_name="Mealie",monitor_type="http",monitor_url="http://192.168.1.200:9925"} Nan
monitor_response_time{monitor_name="Ollama",monitor_type="port",monitor_url="null"} 3.7
# HELP monitor_status Monitor Status (1 = UP, 0 = DOWN, 2 = PENDING, 3 = MAINTENANCE)
# TYPE monitor_status gauge
monitor_status{monitor_name="Jellyfin",monitor_type="http",monitor_url="http://192.168.1.200:8096"} 1
monitor_status{monitor_name="Mealie",monitor_type="http",monitor_url="http://192.168.1.200:9925"} 0
monitor_status{monitor_name="Ollama",monitor_type="port",monitor_url="null"} 1
monitor_status{monitor_name="Paperless",monitor_type="http",monitor_url="null"} 2
`;

describe("parseMetrics", () => {
  it("reads every monitor with its status", () => {
    const monitors = parseMetrics(SAMPLE);

    expect(monitors).toHaveLength(4);
    expect(monitors.map((m) => m.name)).toEqual(["Jellyfin", "Mealie", "Ollama", "Paperless"]);
    expect(monitors.find((m) => m.name === "Mealie")?.status).toBe("down");
    expect(monitors.find((m) => m.name === "Paperless")?.status).toBe("pending");
  });

  it("joins response times to the right monitor", () => {
    const byName = new Map(parseMetrics(SAMPLE).map((m) => [m.name, m]));

    expect(byName.get("Jellyfin")?.responseMs).toBe(42);
    // Kuma writes floats; the tile shows whole milliseconds.
    expect(byName.get("Ollama")?.responseMs).toBe(4);
  });

  it("treats Nan and a missing series as no reading, never as zero", () => {
    const byName = new Map(parseMetrics(SAMPLE).map((m) => [m.name, m]));

    // A down monitor has no timing. Zero would read as "instant".
    expect(byName.get("Mealie")?.responseMs).toBeNull();
    // Paperless has a status line and no response line at all.
    expect(byName.get("Paperless")?.responseMs).toBeNull();
  });

  it('reads Kuma\'s literal "null" label as an absent value', () => {
    const ollama = parseMetrics(SAMPLE).find((m) => m.name === "Ollama");

    expect(ollama?.url).toBeNull();
    expect(ollama?.type).toBe("port");
  });

  it("skips a line with an unknown status code rather than guessing", () => {
    const monitors = parseMetrics(
      'monitor_status{monitor_name="Odd",monitor_type="http",monitor_url="null"} 9\n',
    );

    expect(monitors).toHaveLength(0);
  });

  it("returns nothing for a body that is not metrics", () => {
    // The adapter turns this into a thrown error, because writing an empty
    // parse through would silently empty the gate and read as "all clear".
    expect(parseMetrics("<html><body>Unauthorized</body></html>")).toHaveLength(0);
  });
});
