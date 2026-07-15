/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as api_ from "../api.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as date from "../date.js";
import type * as families from "../families.js";
import type * as files from "../files.js";
import type * as groceryItems from "../groceryItems.js";
import type * as http from "../http.js";
import type * as pages from "../pages.js";
import type * as permissions from "../permissions.js";
import type * as routineCompletions from "../routineCompletions.js";
import type * as routines from "../routines.js";
import type * as secrets from "../secrets.js";
import type * as supportedLocales from "../supportedLocales.js";
import type * as tasks from "../tasks.js";
import type * as today from "../today.js";
import type * as userProfiles from "../userProfiles.js";
import type * as wiki from "../wiki.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  api: typeof api_;
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  date: typeof date;
  families: typeof families;
  files: typeof files;
  groceryItems: typeof groceryItems;
  http: typeof http;
  pages: typeof pages;
  permissions: typeof permissions;
  routineCompletions: typeof routineCompletions;
  routines: typeof routines;
  secrets: typeof secrets;
  supportedLocales: typeof supportedLocales;
  tasks: typeof tasks;
  today: typeof today;
  userProfiles: typeof userProfiles;
  wiki: typeof wiki;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
