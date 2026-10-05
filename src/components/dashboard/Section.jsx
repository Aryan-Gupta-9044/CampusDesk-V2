import React from "react";
import Card from "../ui/Card";
import { SkeletonCard } from "../ui/Skeleton";
import { ErrorState } from "../ui/States";

/** Consistent loading / error wrapper for a whole dashboard. */
export function DashboardFrame({ loading, error, onRetry, skeleton, children }) {
  if (loading) return skeleton;
  if (error) return <Card><ErrorState message="Unable to load your dashboard." onRetry={onRetry} /></Card>;
  return children;
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="stat-grid">{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={2} />)}</div>
      <div className="grid-main"><SkeletonCard height={220} /><SkeletonCard height={220} /></div>
      <div className="grid-2"><SkeletonCard height={220} /><SkeletonCard height={220} /></div>
    </div>
  );
}
