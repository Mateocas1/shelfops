import { ApiRootResponseSchema, type ApiRootResponse } from "@shelfops/contracts/common";
import { LocationConfigurationBodySchema, LocationConfigurationParamsSchema, LocationConfigurationResponseSchema, type LocationConfigurationBody, type LocationConfigurationParams } from "@shelfops/contracts/configuration";
import { AuthenticationRequiredErrorSchema, ForbiddenErrorSchema, IdempotencyConflictErrorSchema, NotFoundErrorSchema, StaleVersionErrorSchema, TemporaryUnavailableErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { DEFAULT_PAGE_SIZE, PaginationQuerySchema, type PaginationQuery } from "@shelfops/contracts/pagination";

export const ApiQuerySchema = PaginationQuerySchema;
export type ApiQuery = PaginationQuery;
export { type ApiRootResponse };
const correlationHeader = {
  description: "Server-generated identifier for support correlation.",
  type: "string"
};

function response(schema: object) {
  return { ...schema, headers: { "X-Correlation-Id": correlationHeader } };
}

export const ApiRootSchema = {
  querystring: ApiQuerySchema,
  response: {
    200: response(ApiRootResponseSchema),
    400: response(ValidationErrorSchema),
    503: response(TemporaryUnavailableErrorSchema)
  }
};

export type { LocationConfigurationBody, LocationConfigurationParams };

export const LocationConfigurationSchema = {
  params: LocationConfigurationParamsSchema,
  body: LocationConfigurationBodySchema,
  response: {
    200: response(LocationConfigurationResponseSchema),
    400: response(ValidationErrorSchema),
    401: response(AuthenticationRequiredErrorSchema),
    403: response(ForbiddenErrorSchema),
    404: response(NotFoundErrorSchema),
    409: response({ oneOf: [IdempotencyConflictErrorSchema, StaleVersionErrorSchema] }),
    503: response(TemporaryUnavailableErrorSchema)
  }
};

export function defaultPage(query: ApiQuery): number {
  return query.limit ?? DEFAULT_PAGE_SIZE;
}
