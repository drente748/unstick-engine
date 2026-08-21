/* ============================================================
   reason/entityTypes — classify the SEMANTIC NATURE of entities.

   Consumes the TaskGraph as-is (never re-parses text). The nature
   decides which action families are valid on each entity — this is
   the knowledge that prevents "Sit down at the room".

   English-only, deterministic, evidence-backed.
   ============================================================ */

import type { EntityType, TaskEntity } from "../types-v5";

/* ---- cleanable spaces (act INSIDE, cleaning targets) ---- */
const CLEANABLE = new Set([
  "room", "bedroom", "kitchen", "bathroom", "garage", "apartment", "house",
  "basement", "attic", "living room", "office room", "dorm", "studio",
]);

/* ---- work surfaces (sit AT, clear OFF) ---- */
const WORK_SURFACES = new Set(["desk", "table", "counter", "countertop", "workbench"]);

/* ---- storage (organize INTO, sort THROUGH) ---- */
const STORAGE = new Set([
  "closet", "drawer", "cabinet", "shelf", "folder", "drive", "inbox",
  "backlog", "files", "documents", "paperwork",
]);

/* ---- communication artifacts ---- */
const COMM_ARTIFACTS = new Set([
  "email", "message", "text", "dm", "letter", "note", "mail", "reply",
  "voicemail", "whatsapp", "slack message",
]);

/* ---- documents ---- */
const DOCUMENTS = new Set([
  "essay", "report", "form", "thesis", "application", "paper", "contract",
  "invoice", "bill", "proposal", "resume", "cv", "presentation", "slides",
  "spreadsheet", "budget",
  /* assessments & renewals are document-work too */
  "exam", "exams", "test", "quiz", "midterm", "final", "passport",
  "passport renewal", "license", "visa", "tax return", "permit",
]);

/* ---- reading material ---- */
const READING = new Set([
  "book", "chapter", "article", "textbook", "blog", "post", "documentation",
  "manual", "guide", "notes",
]);

/* ---- digital systems ---- */
const DIGITAL_SYSTEMS = new Set([
  "website", "site", "app", "codebase", "repo", "portal", "dashboard",
  "account", "browser", "laptop", "computer", "phone", "printer", "code",
  "bug", "checkout flow", "server", "database",
]);

/* ---- abstract projects ---- */
const PROJECTS = new Set([
  "project", "business", "startup", "launch", "campaign", "channel",
  "portfolio", "renovation", "move", "thesis defense",
]);

/* ---- physical objects ---- */
const PHYSICAL_OBJECTS = new Set([
  "tools", "dishes", "laundry", "clothes", "boxes", "trash", "mess",
  "groceries", "stuff", "things", "equipment", "supplies", "car", "bike",
]);

/* ---- wearables ---- */
const WEARABLES = new Set(["clothes", "shoes", "gear", "outfit", "uniform", "gym clothes"]);

/* ---- venues you GO TO ---- */
const VENUES = new Set([
  "gym", "store", "bank", "library", "post office", "pharmacy", "campus",
  "clinic", "dentist office", "salon", "laundromat", "classroom", "park",
]);

/**
 * Classify one entity's semantic nature from its key + role.
 * Role constrains the candidates; the key picks among them.
 * `isCommContext`: the clause's action is communication — flips
 * venue-places into contact parties ("call the bank").
 */
export function classifyEntityType(e: TaskEntity, isCommContext = false): EntityType {
  const k = e.key;

  switch (e.role) {
    case "time":
      return "temporal-reference";
    case "person":
      return "person-contact";
    case "place":
      /* place role + known venue -> venue; else it's a space.
         EXCEPTION: in a communication context the "place" is the
         party being contacted ("call the bank") — a contact, not
         a destination. */
      if (isCommContext && VENUES.has(k)) return "person-contact";
      if (VENUES.has(k)) return "location-venue";
      if (CLEANABLE.has(k)) return "cleanable-space";
      if (WORK_SURFACES.has(k)) return "work-surface";
      return "cleanable-space"; /* default for a named indoor place */
    case "tool":
      if (COMM_ARTIFACTS.has(k)) return "communication-artifact";
      if (DIGITAL_SYSTEMS.has(k)) return "digital-system";
      return "unclassified";
    case "target":
      /* communication context: a venue as target is the party being
         contacted ("call the bank") — same flip as place role */
      if (isCommContext && VENUES.has(k)) return "person-contact";
      if (CLEANABLE.has(k)) return "cleanable-space";
      if (WORK_SURFACES.has(k)) return "work-surface";
      if (STORAGE.has(k)) return "storage-space";
      if (COMM_ARTIFACTS.has(k)) return "communication-artifact";
      if (DOCUMENTS.has(k)) return "document";
      if (READING.has(k)) return "reading-material";
      if (DIGITAL_SYSTEMS.has(k)) return "digital-system";
      if (PROJECTS.has(k)) return "abstract-project";
      if (WEARABLES.has(k)) return "wearable";
      if (PHYSICAL_OBJECTS.has(k)) return "physical-object";
      if (VENUES.has(k)) return "location-venue";
      /* multi-word keys: try the head noun (last word) */
      const last = k.split(" ").pop() ?? "";
      if (CLEANABLE.has(last)) return "cleanable-space";
      if (WORK_SURFACES.has(last)) return "work-surface";
      if (STORAGE.has(last)) return "storage-space";
      if (COMM_ARTIFACTS.has(last)) return "communication-artifact";
      if (DOCUMENTS.has(last)) return "document";
      if (READING.has(last)) return "reading-material";
      if (DIGITAL_SYSTEMS.has(last)) return "digital-system";
      if (PHYSICAL_OBJECTS.has(last)) return "physical-object";
      if (WEARABLES.has(last)) return "wearable";
      return "unclassified";
    case "topic":
      if (PROJECTS.has(k)) return "abstract-project";
      if (DOCUMENTS.has(k.split(" ").pop() ?? "")) return "document";
      if (READING.has(k.split(" ").pop() ?? "")) return "reading-material";
      return "unclassified";
    default:
      return "unclassified";
  }
}

/** Classify every entity in place; returns count classified. */
export function annotateEntityTypes(entities: TaskEntity[], isCommContext = false): number {
  let n = 0;
  for (const e of entities) {
    e.entityType = classifyEntityType(e, isCommContext);
    if (e.entityType !== "unclassified") n++;
  }
  return n;
}
