/**
 * Response/request shapes of the CIMS backend (`server/src/modules/**\/*.schemas.ts`).
 * The backend is the source of truth: when a Zod schema there changes, update this file.
 * (Once `npm run openapi:export` has produced docs/openapi.json these can be generated with openapi-typescript.)
 */
export type Role = "EMPLOYEE" | "ADMIN" | "STOREKEEPER";
export type UserStatus = "ACTIVE" | "INACTIVE" | "LOCKED";
export type UnitType = "MASS" | "VOLUME" | "COUNT";
export type BaseUnit = "g" | "ml" | "piece";
export type RequestStatus =
  "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PARTIALLY_ISSUED" | "ISSUED" | "CANCELLED";

export const REQUEST_STATUSES: readonly RequestStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PARTIALLY_ISSUED",
  "ISSUED",
  "CANCELLED",
];

export interface SessionUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  role: Role;
  status: UserStatus;
}
export interface SessionCapabilities {
  allowAdminIssue: boolean;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export type RequestCounts = Record<RequestStatus, number>;
export type DashboardSummary =
  | {
      role: "EMPLOYEE";
      awaitingReview: number;
      approved: number;
      partiallyIssued: number;
      fullyIssued: number;
    }
  | {
      role: "ADMIN";
      totalRequests: number;
      awaitingDecision: number;
      approved: number;
      partiallyIssued: number;
      fullyIssued: number;
      rejected: number;
      lowStockAlerts: number;
      pendingRequests: RequestSummary[];
      recentActivity: {
        id: string;
        action: string;
        entityType: string;
        createdAt: string;
        actorName: string | null;
      }[];
      lowStockItems: LowStockItem[];
      recentTransactions: StockTransaction[];
    }
  | {
      role: "STOREKEEPER";
      readyToIssue: number;
      partiallyIssued: number;
      issuedToday: number;
      lowStockAlerts: number;
      pendingIssueRequests: RequestSummary[];
      recentHandovers: StockTransaction[];
      lowStockItems: LowStockItem[];
      recentTransactions: StockTransaction[];
    };
export interface LowStockItem {
  chemicalCode: string;
  chemicalName: string;
  packLabel: string;
  availableQuantity: number;
  minimumQuantity: number;
}
export interface InventoryBalance {
  id: string;
  chemicalId: string;
  chemicalCode: string;
  chemicalName: string;
  storageLocation: string | null;
  packSizeId: string;
  packLabel: string;
  unitType: UnitType;
  baseUnit: BaseUnit;
  baseQuantity: string;
  chemicalActive: boolean;
  packActive: boolean;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  minimumQuantity: number;
  lowStock: boolean;
  version: number;
  updatedAt: string;
}
export type TransactionType = "RECEIPT" | "ISSUE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "REVERSAL";
export interface StockTransaction {
  id: string;
  createdAt: string;
  transactionType: TransactionType;
  direction: "IN" | "OUT";
  quantity: number;
  chemical: { id: string; chemicalCode: string; name: string };
  packSize: { id: string; label: string; unitType: string };
  requestItemId: string | null;
  requestId: string | null;
  performedBy: Person;
  reason: string | null;
  reversalOfId: string | null;
  reversedById: string | null;
}
export interface ManagedUser extends SessionUser {
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: Person | null;
  beforeData: unknown;
  afterData: unknown;
  requestId: string | null;
  ipAddress: string | null;
}
export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}
export interface Envelope<T> {
  data: T;
}

export interface FieldError {
  path: string;
  message: string;
}
export interface ApiErrorBody {
  error: { code: string; message: string; fieldErrors?: FieldError[]; requestId?: string };
}

/** `onHand`, `reserved` and `minimumQuantity` are only present for ADMIN and STOREKEEPER. */
export interface BalanceView {
  available: number;
  lowStock: boolean;
  onHand?: number;
  reserved?: number;
  minimumQuantity?: number;
}
export interface PackSize {
  id: string;
  label: string;
  unitType: UnitType;
  baseUnit: BaseUnit;
  baseQuantity: string;
  isActive: boolean;
  balance: BalanceView | null;
}
export interface Chemical {
  id: string;
  chemicalCode: string;
  name: string;
  description: string | null;
  category: string | null;
  hazardNotes: string | null;
  storageLocation: string | null;
  minimumStockAlert: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  packSizes: PackSize[];
}

export interface Person {
  id: string;
  employeeCode: string;
  fullName: string;
}
export interface RequestItem {
  id: string;
  chemical: { id: string; chemicalCode: string; name: string; storageLocation: string | null };
  packSize: { id: string; label: string; unitType: UnitType };
  requestedQuantity: number;
  approvedQuantity: number | null;
  issuedQuantity: number;
  remainingToIssue: number;
  availability: Pick<BalanceView, "available" | "lowStock"> | null;
}
export interface RequestSummary {
  id: string;
  requestNumber: string | null;
  status: RequestStatus;
  purpose: string;
  department: string | null;
  requester: Person;
  itemCount: number;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: Person | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ApprovalAction {
  id: string;
  decision: "APPROVED" | "REJECTED";
  comments: string | null;
  createdAt: string;
  reviewer: Person;
}
export interface IssueRecord {
  id: string;
  requestItemId: string;
  quantity: number;
  createdAt: string;
  performedBy: Person;
}
export interface RequestDetail extends RequestSummary {
  items: RequestItem[];
  approvalActions: ApprovalAction[];
  issues: IssueRecord[];
}

// ---- request bodies ----
export interface RequestItemInput {
  chemicalId: string;
  packSizeId: string;
  quantity: number;
}
export interface CreateRequestBody {
  purpose: string;
  department?: string;
  items: RequestItemInput[];
}
export interface ApproveBody {
  comments?: string;
  approvedQuantities?: { requestItemId: string; approvedQuantity: number }[];
}
export interface IssueBody {
  lines: { requestItemId: string; quantity: number }[];
  note?: string;
}
