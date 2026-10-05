import React from "react";

import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import Card from "../../components/ui/Card";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { SkeletonCard } from "../../components/ui/Skeleton";
import StudentOverview from "./StudentOverview";

export default function ParentDashboard() {
  const { user } = useAuth();
  const { child, loading, error } = useChild();
  if (loading) return <SkeletonCard height={200} />;
  if (error) return <Card><ErrorState message="Unable to load your child's details." /></Card>;
  if (!child) {
    return <Card><EmptyState icon="user" title="No child linked to your account" hint="Ask the school office to link your child's student record." /></Card>;
  }
  return <StudentOverview key={child.id} studentId={child.id} requesterId={user.id} viewer="parent" />;
}
