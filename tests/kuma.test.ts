import { describe, expect, it } from "vitest";
import { parseMetrics } from "@/lib/adapters/kuma";

/**
 * Shaped after the live instance's output. Uptime Kuma emits the three series
 * in separate blocks, response times before statuses, which is why the parser
 * joins them by name after the fact rather than in one pass.
 */
const SAMPLE = `# HELP monitor_cert_days_remaining The number of days remaining until the certificate expires
# TYPE monitor_cert_days_remaining gauge
monitor_cert_days_remaining{monitor_name="Jellyfin",monitor_type="http",monitor_url="http://192.168.1.200:8096"} 61
monitor_cert_days_remaining{monitor_name="Mealie",monitor_type="http",monitor_url="http://192.168.1.200:9925"} Nan
monitor_cert_days_remaining{monitor_name="Paperless",monitor_type="http",monitor_url="null"} -3
# HELP monitor_response_time Monitor Response Time (ms)
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

  it("joins the certificate days to the right monitor", () => {
    const byName = new Map(parseMetrics(SAMPLE).map((m) => [m.name, m]));

    expect(byName.get("Jellyfin")?.certDays).toBe(61);
  });

  it("keeps a certificate at zero rather than dropping it", () => {
    // The opposite of the response-time rule, and deliberately: zero
    // milliseconds would read as "instant", while zero days means expired,
    // which is the single most worth saying. A negative reading is Kuma
    // reporting one that went a while ago, floored rather than discarded.
    const byName = new Map(parseMetrics(SAMPLE).map((m) => [m.name, m]));

    expect(byName.get("Paperless")?.certDays).toBe(0);
  });

  it("has no certificate for a monitor Kuma reports none for", () => {
    // A port check has no certificate at all, and Nan is Kuma saying so. Null
    // has to read as "no certificate", never as one expiring today.
    const byName = new Map(parseMetrics(SAMPLE).map((m) => [m.name, m]));

    expect(byName.get("Ollama")?.certDays).toBeNull();
    expect(byName.get("Mealie")?.certDays).toBeNull();
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
