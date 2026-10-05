import React from "react";
import { Link } from "react-router-dom";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Icon from "../ui/Icon";

const LABEL = { danger: "Urgent", warning: "Soon", info: "Info" };

/** "What do I need to do?" - hidden entirely when there is nothing to do. */
export default function ActionRequired({ items = [] }) {
  if (!items.length) return null;
  return (
    <Card title="Action required" subtitle={`${items.length} item${items.length === 1 ? "" : "s"} need your attention`} className="action-card" style={{ marginBottom: 16 }}>
      <ul className="feed">
        {items.map((a) => (
          <li key={a.key}>
            <span className="notif-ico"><Icon name="alert" size={15} /></span>
            <div style={{ flex: 1 }}><Link to={a.to} className="feed-title" style={{ color: "inherit" }}>{a.text}</Link></div>
            <Badge tone={a.tone}>{LABEL[a.tone]}</Badge>
          </li>))}
      </ul>
    </Card>
  );
}
