import type { ProviderId, Site } from "./catalog";

export type SiteImage = {
  url: string;
  caption: string;
  source: string;
  /** Whether the photo is documented as being from the modeled site's campus. */
  siteSpecific: boolean;
  /** A documented facility in the selected region, but not necessarily the modeled campus. */
  regionSpecific?: boolean;
};

const googleGallery = "https://datacenters.google/discover-more/photo-gallery/";

// Google identifies these photos by campus in its photo gallery or location pages.
// The selected site is still a model: the API does not disclose the serving facility.
const googleImages: Record<string, SiteImage> = {
  "The Dalles, Oregon": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/06/f7/d4804625439aab7dff58812f90d5/the-dalles-exterior.jpg",
    caption: "Google · The Dalles campus",
    source: googleGallery,
    siteSpecific: true,
  },
  "Council Bluffs, Iowa": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/c4/4d/5663ee5e442d878e3ae8f2438bad/council-bluffs-exterior.jpg",
    caption: "Google · Council Bluffs campus",
    source: googleGallery,
    siteSpecific: true,
  },
  "Ashburn, Virginia": {
    url: "/photos/ashburn-data-centers.jpg",
    caption: "Data centers near Ashburn, Virginia",
    source: "https://commons.wikimedia.org/wiki/File:Data_centers_in_Ashburn.jpg",
    siteSpecific: false,
    regionSpecific: true,
  },
  "Berkeley County, SC": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/16/4f/ab1e97d440778d535122936aaf7e/berkeley-county-exterior.jpg",
    caption: "Google · Berkeley County campus",
    source: googleGallery,
    siteSpecific: true,
  },
  "Quilicura, Chile": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/b3/01/aa1ad0744cb2ae1a70dda631371a/datacenter-quilicura-crop.jpeg",
    caption: "Google · Quilicura campus",
    source: "https://datacenters.google/locations/quilicura-chile/",
    siteSpecific: true,
  },
  "Dublin, Ireland": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/82/7b/2c9bddd54206b095364b579433cf/dublin-air-cooling-system.jpg",
    caption: "Google · Dublin cooling system",
    source: googleGallery,
    siteSpecific: true,
  },
  "Eemshaven, Netherlands": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/d2/a8/10f6a703472d9a7d05bc37a5e6dc/eemshaven-wind-turbines.jpg",
    caption: "Google · Eemshaven campus",
    source: googleGallery,
    siteSpecific: true,
  },
  "Hamina, Finland": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/f9/21/bcd7681e4dc28ce03399470f6171/hamina-exterior-finland.jpg",
    caption: "Google · Hamina campus",
    source: googleGallery,
    siteSpecific: true,
  },
  "St. Ghislain, Belgium": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/e3/16/80f6b10c46f6a5c613a08a95d088/st-ghislain-data-center-exterior.jpg",
    caption: "Google · St. Ghislain campus",
    source: googleGallery,
    siteSpecific: true,
  },
  Singapore: {
    url: "https://www.gstatic.com/marketing-cms/assets/images/56/5c/bbc969a84802b43c6d5216d9d42c/singapore-exterior.jpg",
    caption: "Google · Singapore campus",
    source: googleGallery,
    siteSpecific: true,
  },
  "Changhua, Taiwan": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/62/9e/a83866944646bb64c130a1e483d2/changhua-county-taiwan-hero.jpg",
    caption: "Google · Changhua County campus",
    source: "https://datacenters.google/locations/taiwan/",
    siteSpecific: true,
  },
  "Inzai, Japan": {
    url: "https://www.gstatic.com/marketing-cms/assets/images/1f/e2/64c2bbc14ba8afd99e695c9ca2b6/inzai-japan.jpg",
    caption: "Google · Inzai campus",
    source: googleGallery,
    siteSpecific: true,
  },
};

const providerReferences: Record<ProviderId, SiteImage> = {
  gemini: googleImages["The Dalles, Oregon"],
  anthropic: {
    url: "https://assets.aboutamazon.com/dims4/default/64ba77c/2147483647/strip/true/crop/2000x1125%2B0%2B0/resize/1320x743%21/quality/90/?url=https%3A%2F%2Fassets.aboutamazon.com%2F12%2F24%2Fc0f4127a4831a2497c507bc2aa7c%2Faws-virginia-hero-1.jpg",
    caption: "AWS data center reference",
    source: "https://www.aboutamazon.com/news/aws/aws-commitment-to-virginia",
    siteSpecific: false,
  },
  openai: {
    url: "https://msftstories.thesourcemediaassets.com/sites/696/2024/12/Azure-Cobalt-100-in-DC.jpg",
    caption: "Microsoft data center reference",
    source: "https://news.microsoft.com/datacenters/",
    siteSpecific: false,
  },
  xai: {
    url: "https://media.x.ai/cdn-cgi/image/fit%3Dscale-down%2Conerror%3Dredirect%2Cf%3Dauto/v1/website/colossussite2-aac5dac3.jpg",
    caption: "xAI Colossus reference · Memphis",
    source: "https://x.ai/colossus",
    siteSpecific: false,
  },
};

const regionalImages: Partial<Record<ProviderId, Record<string, SiteImage>>> = {
  anthropic: {
    "N. Virginia": {
      url: "https://assets.aboutamazon.com/dims4/default/64ba77c/2147483647/strip/true/crop/2000x1125%2B0%2B0/resize/1320x743%21/quality/90/?url=https%3A%2F%2Fassets.aboutamazon.com%2F12%2F24%2Fc0f4127a4831a2497c507bc2aa7c%2Faws-virginia-hero-1.jpg",
      caption: "AWS · Northern Virginia data center",
      source: "https://www.aboutamazon.com/news/aws/aws-commitment-to-virginia",
      siteSpecific: false,
      regionSpecific: true,
    },
  },
  openai: {
    "Sweden Central": {
      url: "https://msftstories.thesourcemediaassets.com/sites/93/2021/11/MS-Data-center-Sweden-960x640.jpg",
      caption: "Microsoft · Sweden data center",
      source: "https://news.microsoft.com/europe/2021/11/16/microsoft-opens-its-sustainable-datacenter-region-in-sweden-creating-new-opportunities-for-a-cloud-first-sweden/",
      siteSpecific: false,
      regionSpecific: true,
    },
  },
};

export const orbitImage: SiteImage = {
  url: "https://techcrunch.com/wp-content/uploads/2026/03/Starcloud-1-deployment-virtical-e1774655359557.png?w=549",
  caption: "Starcloud-1",
  source: "https://techcrunch.com/2026/03/30/starcloud-raises-170-million-series-ato-build-data-centers-in-space/",
  siteSpecific: false,
};

export function imageForSite(provider: ProviderId, site: Site): SiteImage {
  return provider === "gemini"
    ? googleImages[site.name] ?? { ...providerReferences.gemini, caption: "Google facility reference · The Dalles", siteSpecific: false }
    : regionalImages[provider]?.[site.name] ?? providerReferences[provider];
}
