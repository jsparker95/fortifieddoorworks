"use client";
import { useMemo } from "react";
import { derive, str } from "@/lib/production";
import type { ProjectData } from "@/lib/types";

const hardwareCategories = ["Lever / lock", "Closer", "Panic hardware", "Weatherstrip / sweep", "Kick plate", "Threshold / transition", "Other"];
const categories = ["Single frame", "Double frame", "Single door", "Double door", ...hardwareCategories];
const defaults = Object.fromEntries(categories.map((name) => [name, { hours: 0, price: 0 }]));
const feet = (value: unknown) => Number.parseInt(str(value).match(/^\s*(\d+)/)?.[1] || "0", 10);

export function InstallationEstimator({ data, onChange }: { data: ProjectData; onChange: (data: ProjectData) => void }) {
  const derived = useMemo(() => derive(data), [data]);
  const counts = useMemo(() => {
    const values = Object.fromEntries(categories.map((name) => [name, 0])) as Record<string, number>;
    for (const opening of derived.frames) {
      const double = feet(opening.width) >= 4 || /RIA|C\/IN|INACTIVE/i.test(str(opening.handing));
      const frameIncluded = str(opening.wall).toUpperCase() !== "NA";
      const doorIncluded = str(opening.doorType).toUpperCase() !== "NA";
      if (frameIncluded) values[double ? "Double frame" : "Single frame"]++;
      if (doorIncluded) values[double ? "Double door" : "Single door"]++;
    }
    for (const item of derived.hardware) {
      const category = str(item.installCategory);
      if (hardwareCategories.includes(category)) values[category] += Number(item.lineQty || 0);
    }
    return values;
  }, [derived]);
  const rates = { ...defaults, ...(data.installRates || {}) };
  const totalHours = categories.reduce((sum, name) => sum + counts[name] * Number(rates[name]?.hours || 0), 0);
  const totalPrice = categories.reduce((sum, name) => sum + counts[name] * Number(rates[name]?.price || 0), 0);
  function changeRate(name: string, key: "hours" | "price", value: number) {
    onChange({ ...data, installRates: { ...rates, [name]: { ...rates[name], [key]: value } } });
  }
  return <section className="panel install-estimator">
    <div className="panel-heading"><div><h2>Installation package</h2><p>Counts update from this phase’s openings and hardware. Assign a category to each hardware line, then enter your labor and sell-price assumptions.</p></div></div>
    <div className="table-scroll"><table><thead><tr><th>Install item</th><th>Quantity</th><th>Labor hours / unit</th><th>Sell price / unit</th><th>Labor hours</th><th>Subtotal</th></tr></thead><tbody>
      {categories.map((name) => <tr key={name}><td>{name}</td><td>{counts[name]}</td><td><input aria-label={`${name} labor hours per unit`} type="number" min="0" step="0.05" value={rates[name]?.hours || 0} onChange={(event) => changeRate(name, "hours", Number(event.target.value))}/></td><td><input aria-label={`${name} sell price per unit`} type="number" min="0" step="0.01" value={rates[name]?.price || 0} onChange={(event) => changeRate(name, "price", Number(event.target.value))}/></td><td>{(counts[name] * Number(rates[name]?.hours || 0)).toFixed(2)}</td><td>${(counts[name] * Number(rates[name]?.price || 0)).toFixed(2)}</td></tr>)}
      <tr className="install-total"><td>Total</td><td>{Object.values(counts).reduce((a, b) => a + b, 0)}</td><td colSpan={2}>Optional package estimate</td><td>{totalHours.toFixed(2)} hrs</td><td>${totalPrice.toFixed(2)}</td></tr>
    </tbody></table></div>
    <p className="printing-note">Double counts include openings wider than 4 feet or marked as pairs. Hardware quantities come from the schedule and must be categorized explicitly. Save this project phase to retain rate changes.</p>
  </section>;
}
