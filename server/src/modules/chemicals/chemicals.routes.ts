import { ApiRouter } from "../../common/api-router.js";
import { rolesFor } from "../../common/permissions.js";
import { idParams } from "../../common/schemas.js";
import {
  chemicalListResponse,
  chemicalResponse,
  createChemicalBody,
  listChemicalsQuery,
  packParams,
  packSizeInput,
  packSizeResponse,
  updateChemicalBody,
  updatePackSizeBody,
} from "./chemicals.schemas.js";
import {
  createChemical,
  createPackSize,
  getChemical,
  listChemicals,
  updateChemical,
  updatePackSize,
} from "./chemicals.service.js";

export function registerChemicalRoutes(api: ApiRouter): void {
  const admin = rolesFor("chemicals:manage");
  api.route({
    method: "get",
    path: "/chemicals",
    summary: "Search chemicals with pack sizes and availability",
    description:
      "Employees see active chemicals and active pack sizes with `available` stock only. ADMIN and STOREKEEPER additionally see on-hand, reserved and threshold values and inactive records.",
    tags: ["Chemicals"],
    access: "authenticated",
    query: listChemicalsQuery,
    response: chemicalListResponse,
    handler: async ({ query, user }) => listChemicals(user, query),
  });
  api.route({
    method: "get",
    path: "/chemicals/:id",
    summary: "Chemical details",
    tags: ["Chemicals"],
    access: "authenticated",
    params: idParams,
    response: chemicalResponse,
    handler: async ({ params, user }) => ({ data: await getChemical(user, params.id) }),
  });
  api.route({
    method: "post",
    path: "/chemicals",
    summary: "Create a chemical (optionally with pack sizes)",
    description:
      "Each pack size starts with a zero balance; record stock with POST /stock-transactions/receipts.",
    tags: ["Chemicals"],
    access: admin,
    body: createChemicalBody,
    response: chemicalResponse,
    successStatus: 201,
    errorStatuses: [409],
    handler: async ({ body, ctx }) => ({ data: await createChemical(ctx, body) }),
  });
  api.route({
    method: "patch",
    path: "/chemicals/:id",
    summary: "Update chemical master data (chemicals are deactivated, never deleted)",
    tags: ["Chemicals"],
    access: admin,
    params: idParams,
    body: updateChemicalBody,
    response: chemicalResponse,
    handler: async ({ params, body, ctx }) => ({ data: await updateChemical(ctx, params.id, body) }),
  });
  api.route({
    method: "post",
    path: "/chemicals/:id/pack-sizes",
    summary: "Add a pack size",
    tags: ["Chemicals"],
    access: admin,
    params: idParams,
    body: packSizeInput,
    response: packSizeResponse,
    successStatus: 201,
    errorStatuses: [409],
    handler: async ({ params, body, ctx }) => ({ data: await createPackSize(ctx, params.id, body) }),
  });
  api.route({
    method: "patch",
    path: "/chemicals/:id/pack-sizes/:packSizeId",
    summary: "Rename or (de)activate a pack size (unit and size are immutable)",
    tags: ["Chemicals"],
    access: admin,
    params: packParams,
    body: updatePackSizeBody,
    response: packSizeResponse,
    handler: async ({ params, body, ctx }) => ({
      data: await updatePackSize(ctx, params.id, params.packSizeId, body),
    }),
  });
}
