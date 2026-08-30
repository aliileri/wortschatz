import { todayStr } from "../logic/workdays.js";

export function today() {
  return todayStr();
}

export function nowIso() {
  return new Date().toISOString();
}

export function dateKeyOf(iso) {
  return iso.slice(0, 10);
}
