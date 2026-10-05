import React from "react";

export function Skeleton({ width = "100%", height = 16, radius, style }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3, height }) {
  return (
    <div className="card skeleton-card" role="status" aria-label="Loading">
      <Skeleton width="40%" height={14} />
      <div style={{ height: 12 }} />
      {height ? <Skeleton height={height} /> : Array.from({ length: lines }, (_, i) => (
        <div key={i} style={{ marginBottom: 10 }}><Skeleton width={`${90 - i * 12}%`} /></div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="stat-grid" role="status" aria-label="Loading statistics">
      {Array.from({ length: count }, (_, i) => (
        <div className="stat" key={i}><Skeleton width="50%" height={12} /><div style={{ height: 14 }} /><Skeleton width="60%" height={28} /></div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div role="status" aria-label="Loading table">
      {Array.from({ length: rows }, (_, i) => <div key={i} style={{ marginBottom: 12 }}><Skeleton height={20} /></div>)}
    </div>
  );
}

export default Skeleton;
