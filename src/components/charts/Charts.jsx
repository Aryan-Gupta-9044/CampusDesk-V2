import React from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { EmptyState } from "../ui/States";

const C = {
  p: "var(--chart-1)", g: "var(--chart-2)", a: "var(--chart-3)", m: "var(--chart-4)", r: "var(--chart-5)",
};
const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />;
const pctAxis = <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={42} tickLine={false} axisLine={false} />;
const tip = <Tooltip formatter={(v) => (v == null ? "—" : `${v}%`)} />;

const hasValues = (data, keys) => data?.some((d) => keys.some((k) => d[k] != null && !Number.isNaN(d[k])));

function Box({ children, height = 240 }) {
  return <div className="chart-box" style={{ height }}>{children}</div>;
}
const Empty = ({ text }) => <EmptyState icon="chart" title={text} hint="Charts appear once data is available." />;

/** Weekly attendance % line. data: [{ label, pct }] */
export function AttendanceTrendChart({ data }) {
  if (!hasValues(data, ["pct"])) return <Empty text="No attendance data" />;
  return (
    <Box><ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}<XAxis dataKey="label" tickLine={false} axisLine={false} />{pctAxis}{tip}
        <Line type="monotone" dataKey="pct" name="Attendance" stroke={C.p} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
      </LineChart>
    </ResponsiveContainer></Box>
  );
}

/** Generic % bar chart. data rows need `nameKey` and `valueKey`. */
export function PercentBarChart({ data, nameKey = "name", valueKey = "value", color = C.p, label = "Score", height }) {
  if (!hasValues(data, [valueKey])) return <Empty text="No data available" />;
  return (
    <Box height={height}><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}<XAxis dataKey={nameKey} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />{pctAxis}{tip}
        <Bar dataKey={valueKey} name={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

/** Student score vs class average (grouped bars). rows: { [xKey], student, classAverage } */
export function ComparisonChart({ data, xKey, studentLabel = "Your score", avgLabel = "Class average" }) {
  if (!hasValues(data, ["student", "classAverage"])) return <Empty text="No results available" />;
  const showAvg = data.some((d) => d.classAverage != null);
  return (
    <Box><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}<XAxis dataKey={xKey} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />{pctAxis}{tip}
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="student" name={studentLabel} fill={C.p} radius={[4, 4, 0, 0]} maxBarSize={32} />
        {showAvg && <Bar dataKey="classAverage" name={avgLabel} fill={C.m} radius={[4, 4, 0, 0]} maxBarSize={32} />}
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

/** Exam-by-exam line: student vs class average. */
export function ExamTrendChart({ data }) {
  if (!hasValues(data, ["student"])) return <Empty text="No exam results yet" />;
  const showAvg = data.some((d) => d.classAverage != null);
  return (
    <Box><ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}<XAxis dataKey="exam" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />{pctAxis}{tip}
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="student" name="Your score" stroke={C.p} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
        {showAvg && <Line type="monotone" dataKey="classAverage" name="Class average" stroke={C.m} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />}
      </LineChart>
    </ResponsiveContainer></Box>
  );
}

/** Admin: two series per class. */
export function ClassBarChart({ data, series }) {
  if (!hasValues(data, series.map((s) => s.key))) return <Empty text="No data available" />;
  return (
    <Box><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}<XAxis dataKey="label" tickLine={false} axisLine={false} />{pctAxis}{tip}
        {series.length > 1 && <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={[C.p, C.g][i % 2]} radius={[4, 4, 0, 0]} maxBarSize={30} />)}
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

/** Fee collection: collected vs outstanding (INR) per class. */
export function FeeChart({ data }) {
  if (!hasValues(data, ["collected", "outstanding"])) return <Empty text="No fee data" />;
  const fmt = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${Math.round(v / 1000)}k`);
  return (
    <Box><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}<XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmt} width={48} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => `₹${new Intl.NumberFormat("en-IN").format(v)}`} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="collected" name="Collected" stackId="f" fill={C.g} />
        <Bar dataKey="outstanding" name="Outstanding" stackId="f" fill={C.a} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

/** Student / teacher distribution per class (stacked counts). */
export function DistributionChart({ data }) {
  if (!hasValues(data, ["students", "teachers"])) return <Empty text="No data available" />;
  return (
    <Box><ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}<XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
        <Tooltip /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="students" name="Students" fill={C.p} radius={[4, 4, 0, 0]} maxBarSize={30} />
        <Bar dataKey="teachers" name="Teachers" fill={C.g} radius={[4, 4, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer></Box>
  );
}

export function DonutChart({ data, height = 200 }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <Empty text="No data available" />;
  const colors = [C.g, C.a, C.r, C.p, C.m];
  return (
    <Box height={height}><ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((d, i) => <Cell key={d.name} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer></Box>
  );
}
