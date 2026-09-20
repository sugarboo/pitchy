import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "../../app/i18n";
import { PitchCanvas, type PitchCanvasProps } from "../../components/PitchCanvas";
import { SessionTrace } from "./SessionTrace";

vi.mock("../../components/PitchCanvas", () => ({ PitchCanvas: vi.fn(() => null) }));

describe("saved trace overview", () => {
  it("shows the full observation span, preserving tuning coordinates and gaps", () => {
    const points = [
      { timestampMs: 100, midi: 70.0127 },
      { timestampMs: 15000, midi: null },
      { timestampMs: 60000, midi: 69 },
    ];
    renderToStaticMarkup(
      <SessionTrace points={points} messages={getMessages("en")} theme="light" />,
    );
    const props = vi.mocked(PitchCanvas).mock.calls.at(-1)?.[0] as PitchCanvasProps;
    expect(props.windowMs).toBe(59900);
    expect(props.midiOffset).toBeUndefined();
    const actual: typeof points = [];
    props.trace.forEach((point) => {
      actual.push(point);
    });
    expect(actual).toEqual(points);
    expect(props.theme).toBe("light");
  });
  it("labels empty evidence instead of drawing a fabricated zero pitch", () => {
    const html = renderToStaticMarkup(
      <SessionTrace
        points={[{ timestampMs: 1, midi: null }]}
        messages={getMessages("zh-CN")}
        theme="dark"
      />,
    );
    expect(html).toContain(getMessages("zh-CN").insufficientData);
    expect(html).not.toContain("canvas");
  });
});
