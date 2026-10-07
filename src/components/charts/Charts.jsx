import React from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTheme } from "../../context/ThemeContext";
import { EmptyState } from "../ui/States";

// Colours come from the active theme (CSS variables), resolved to real values because SVG attributes need them.
// ThemeProvider sets data-theme before children re-render, so a theme switch redraws charts with the new palette.
function useC() {
  useTheme();
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    p: v("--chart-1"), r: v("--chart-2"), a: v("--chart-3"), m: v("--chart-4"), g: v("--chart-5"), rose: v("--chart-6"),
    line: v("--line"),
    x: (c) => (typeof c === "string" && c.startsWith("var(") ? v(c.slice(4, -1)) : c),
  };
}
const grid = (C) => <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />;
const pctAxis = <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={42} tickLine={false} axisLine={false} />;
const tip = <Tooltip formatter={(v) => (v == null ? "—" : `${v}%`)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)" }} />;

const hasValues = (data, keys) => data?.some((d) => keys.some((k) => d[k] != null && !Number.isNaN(d[k])));

function Box({ children, height = 240 }) {
  return <div className="chart-box" style={{ height }}>{children}</div>;
}
const Empty = ({ text }) => <EmptyState icon="chart" title={text} hint="Charts appear once data is available." />;

/** Weekly attendance % line. data: [{ label, pct }] */
export function AttendanceTrendChart({ data }) {
  const C = useC();
  if (!hasValues(data, ["pct"])) return <Empty text="No attendance data" />;
  return (
    <Box><ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid(C)}<XAxis dataKey="label" tickLine={false} axisLine={false} />{pctAxis}{tip}
        <Line type="monotone" dataKey="pct" name="Attendance" stroke={C.p} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
      </LineChart>
    </ResponsiveContainer></Box>
  );
}

/** Generic % bar chart. data rows need `nameKey` and `valueKey`. */
export function PercentBarChart({ data, nameKey = "name", valueKey = "value", color, label = "Score", height }) {
  const C = useC();
  if (!hasValues(data, [valueKey])) return <Empty text="No data available" />;
  return (
    <Box height={height}><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid(C)}<XAxis dataKey={nameKey} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />{pctAxis}{tip}
        <Bar dataKey={valueKey} name={label} fill={color ? C.x(color) : C.p} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

/** Student score vs class average (grouped bars). rows: { [xKey], student, classAverage } */
export function ComparisonChart({ data, xKey, studentLabel = "Your score", avgLabel = "Class average" }) {
  const C = useC();
  if (!hasValues(data, ["student", "classAverage"])) return <Empty text="No results available" />;
  const showAvg = data.some((d) => d.classAverage != null);
  return (
    <Box><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid(C)}<XAxis dataKey={xKey} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />{pctAxis}{tip}
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="student" name={studentLabel} fill={C.p} radius={[4, 4, 0, 0]} maxBarSize={32} />
        {showAvg && <Bar dataKey="classAverage" name={avgLabel} fill={C.m} radius={[4, 4, 0, 0]} maxBarSize={32} />}
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

/** Exam-by-exam line: student vs class average. */
export function ExamTrendChart({ data }) {
  const C = useC();
  if (!hasValues(data, ["student"])) return <Empty text="No exam results yet" />;
  const showAvg = data.some((d) => d.classAverage != null);
  return (
    <Box><ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid(C)}<XAxis dataKey="exam" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />{pctAxis}{tip}
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="student" name="Your score" stroke={C.p} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
        {showAvg && <Line type="monotone" dataKey="classAverage" name="Class average" stroke={C.m} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />}
      </LineChart>
    </ResponsiveContainer></Box>
  );
}

/** Admin: two series per class. */
export function ClassBarChart({ data, series }) {
  const C = useC();
  if (!hasValues(data, series.map((s) => s.key))) return <Empty text="No data available" />;
  return (
    <Box><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid(C)}<XAxis dataKey="label" tickLine={false} axisLine={false} />{pctAxis}{tip}
        {series.length > 1 && <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={[C.p, C.a][i % 2]} radius={[4, 4, 0, 0]} maxBarSize={30} />)}
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

/** Fee collection: collected vs outstanding (INR) per class. */
export function FeeChart({ data }) {
  const C = useC();
  if (!hasValues(data, ["collected", "outstanding"])) return <Empty text="No fee data" />;
  const fmt = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${Math.round(v / 1000)}k`);
  return (
    <Box><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid(C)}<XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmt} width={48} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => `₹${new Intl.NumberFormat("en-IN").format(v)}`} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="collected" name="Collected" stackId="f" fill={C.p} />
        <Bar dataKey="outstanding" name="Outstanding" stackId="f" fill={C.a} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

/** Student / teacher distribution per class (stacked counts). */
export function DistributionChart({ data }) {
  const C = useC();
  if (!hasValues(data, ["students", "teachers"])) return <Empty text="No data available" />;
  return (
    <Box><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid(C)}<XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }} /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="students" name="Students" fill={C.p} radius={[4, 4, 0, 0]} maxBarSize={30} />
        <Bar dataKey="teachers" name="Teachers" fill={C.g} radius={[4, 4, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

export function DonutChart({ data, height = 200 }) {
  const C = useC();
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <Empty text="No data available" />;
  const colors = [C.p, C.a, C.r, C.m, C.g, C.rose];
  return (
    <Box height={height}><ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((d, i) => <Cell key={d.name} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }} /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer></Box>
  );
}
