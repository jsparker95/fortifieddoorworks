import { derive, same, str } from "./production";
import { ProjectData } from "./types";

export type SubmittalOpening = {
  openingId: string;
  name: string;
  items: string[];
};

const feetInches = (value: unknown) => {
  const parts = str(value).split("/");
  return parts.length === 2 ? `${parts[0]}'-${parts[1]}\"` : str(value);
};

const depthInches = (value: unknown) => {
  const depth = Number.parseFloat(str(value));
  return Number.isFinite(depth) && depth >= 100
    ? (depth / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
    : str(value);
};

const normalized = (value: string) => value.replace(/\s+/g, " ").trim();

/** Map active phase records to the legacy submittal's per-opening item list. */
export function submittalOpenings(data: ProjectData): SubmittalOpening[] {
  const { frames, doors, hardware } = derive(data);
  const wallsByName = new Map(data.walls.map((wall) => [str(wall.name).toLowerCase(), wall]));
  const doorsById = new Map(doors.map((door) => [door.id, door]));

  return frames.map((frame) => {
    const items: string[] = [];
    const door = doorsById.get(frame.id);
    const wall = wallsByName.get(str(frame.wall).toLowerCase());
    const width = feetInches(frame.width);
    const height = feetInches(frame.height);
    const handing = str(frame.handing);

    if (same(frame.wall, "NA")) {
      items.push("Frame provided by others");
    } else {
      items.push(
        normalized(
          `1ea. ${str(wall?.brand || frame.brand) || "Frame manufacturer TBD"} ${width} x ${height} x ${depthInches(frame.depth)}\" HM ${str(frame.frameType)} Frame (${handing})`,
        ),
      );
    }

    if (!door || same(door.doorType, "NA")) {
      items.push("Door provided by others");
    } else {
      const doorDetails = [
        "1ea.",
        str(door.brand),
        width,
        "x",
        height,
        str(door.material),
        str(door.window),
        handing ? `(${handing})` : "",
        str(door.fire),
      ].filter(Boolean);
      items.push(normalized(doorDetails.join(" ")));
    }

    if (str(frame.group).trim()) {
      for (const part of hardware.filter((line) => same(line.group, frame.group))) {
        const brand = str(part.selectedBrand || part.brand);
        const component = str(part.selectedComponent || part.component);
        const description = `${str(part.qty) || "0"}ea. ${brand} ${component}`;
        if (brand || component) items.push(normalized(description));
      }
    }

    return {
      openingId: frame.id,
      name: str(frame.name),
      items,
    };
  });
}
