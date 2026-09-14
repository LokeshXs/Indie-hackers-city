import type { MetadataRoute } from "next";
import { siteOrigin, isPreviewDeployment } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return isPreviewDeployment ? [] : [{ url: `${siteOrigin()}/` }];
}
