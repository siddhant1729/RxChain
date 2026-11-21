import type { StatusName, VerdictName } from "./types";

export const VERDICT_STYLE: Record<
  VerdictName,
  {
    label: string;
    banner: string;
    badge: string;
    icon: "check" | "x" | "alert" | "recall" | "clock" | "truck";
    headline: string;
  }
> = {
  GENUINE: {
    label: "Genuine",
    headline: "GENUINE",
    banner: "bg-emerald-600 text-white",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    icon: "check",
  },
  COUNTERFEIT: {
    label: "Counterfeit",
    headline: "COUNTERFEIT",
    banner: "bg-red-600 text-white",
    badge: "bg-red-50 text-red-700 ring-red-600/20",
    icon: "x",
  },
  SUSPICIOUS: {
    label: "Suspicious",
    headline: "SUSPICIOUS",
    banner: "bg-red-600 text-white",
    badge: "bg-red-50 text-red-700 ring-red-600/20",
    icon: "alert",
  },
  RECALLED: {
    label: "Recalled",
    headline: "RECALLED",
    banner: "bg-orange-500 text-white",
    badge: "bg-orange-50 text-orange-700 ring-orange-600/20",
    icon: "recall",
  },
  EXPIRED: {
    label: "Expired",
    headline: "EXPIRED",
    banner: "bg-slate-500 text-white",
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20",
    icon: "clock",
  },
  IN_SUPPLY_CHAIN: {
    label: "In supply chain",
    headline: "IN SUPPLY CHAIN",
    banner: "bg-blue-600 text-white",
    badge: "bg-blue-50 text-blue-700 ring-blue-600/20",
    icon: "truck",
  },
};

export const VERDICT_ADVICE: Record<VerdictName, string> = {
  GENUINE:
    "This medicine is authentic and reached a licensed pharmacy through a verified chain of custody. Safe to dispense.",
  COUNTERFEIT:
    "This code is not on the RxChain ledger. Do not consume. Report the product to the pharmacy and the drug regulator.",
  SUSPICIOUS:
    "The record exists but something is wrong with it. Do not consume until the pharmacy or regulator has checked it.",
  RECALLED:
    "The manufacturer or regulator has recalled this batch. Do not consume. Return it to the pharmacy.",
  EXPIRED: "This batch is past its expiry date. Do not consume.",
  IN_SUPPLY_CHAIN:
    "Authentic, but it has not yet been received by a pharmacy. If someone is selling it to you directly, be cautious.",
};

export const STATUS_STYLE: Record<StatusName, { label: string; className: string }> = {
  Created: { label: "Held", className: "bg-slate-100 text-slate-700 ring-slate-500/20" },
  InTransit: { label: "In transit", className: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  Delivered: {
    label: "Delivered",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  Recalled: { label: "Recalled", className: "bg-orange-50 text-orange-700 ring-orange-600/20" },
};
