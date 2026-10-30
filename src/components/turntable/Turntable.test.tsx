import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Album, PlaybackStatus } from "../../lib/store/queue";
import Turntable, { type TurntableProps } from "./Turntable";

const album: Album = {
  id: "a1",
  uri: "spotify:album:a1",
  name: "Ten Songs",
  artists: ["The Band"],
  imageUrl: "https://i.scdn.co/image/ten",
  tracks: Array.from({ length: 10 }, (_, i) => ({
    uri: `spotify:track:t${i + 1}`,
    name: `Song ${i + 1}`,
    durationMs: 100_000,
  })),
};

function setup(overrides: Partial<TurntableProps> = {}) {
  const props: TurntableProps = {
    album,
    position: { trackIndex: 2, positionMs: 50_000 },
    status: "Playing",
    ...overrides,
  };
  const utils = render(<Turntable {...props} />);
  return { props, ...utils };
}

describe("Turntable", () => {
  it("shows the cover above the spinning record, with the tonearm at the album progress", () => {
    setup();
    const cover = screen.getByRole("img", { name: "Ten Songs by The Band" });
    const record = screen.getByTestId("record");
    expect(
      cover.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("record-spinner")).toHaveClass(
      "animate-spin-record",
    );
    // (2 tracks x 100s + 50s) / 1000s
    expect(
      screen
        .getByTestId("tonearm")
        .style.getPropertyValue("--tonearm-progress"),
    ).toBe("0.25");
    expect(
      screen.getByText("Song 3", { selector: '[data-testid="now-playing"] *' }),
    ).toBeInTheDocument();
  });

  it("lets a very long track and album name wrap inside the now-playing column", () => {
    const longName = "x".repeat(120);
    setup({
      album: {
        ...album,
        name: longName,
        tracks: [
          { uri: "spotify:track:long", name: longName, durationMs: 1000 },
        ],
      },
      position: { trackIndex: 0, positionMs: 0 },
    });
    const nowPlaying = screen.getByTestId("now-playing");
    expect(nowPlaying).toHaveClass("min-w-0");
    for (const line of nowPlaying.querySelectorAll("p"))
      expect(line).toHaveClass("break-words");
  });

  it("stops the record and rests the arm when the queue runs out (AE3)", () => {
    const { props, rerender } = setup({ status: "AlbumEnding" });
    rerender(
      <Turntable {...props} status={"Resting" satisfies PlaybackStatus} />,
    );
    expect(screen.getByTestId("record-spinner")).not.toHaveClass(
      "animate-spin-record",
    );
    expect(screen.getByTestId("tonearm")).toHaveAttribute("data-resting");
  });

  it("leaves playback controls and the track list to the app shell", () => {
    setup();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows an empty record with the arm at rest when nothing is on", () => {
    setup({
      album: null,
      status: "Resting",
      position: { trackIndex: 0, positionMs: 0 },
    });
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("record")).toBeInTheDocument();
    expect(screen.getByTestId("tonearm")).toHaveAttribute("data-resting");
    expect(screen.queryByRole("list")).toBeNull();
  });
});
