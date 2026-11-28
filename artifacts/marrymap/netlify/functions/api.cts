import serverless from "serverless-http";
import { createApp } from "../../../api-server/src/app";
import { deployOrigins } from "../deploy-origins";

export const handler = serverless(createApp({ deployOrigins }));
