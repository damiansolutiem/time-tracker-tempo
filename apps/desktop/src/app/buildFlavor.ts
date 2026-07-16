export type BuildFlavor = 'production' | 'development';

export const buildFlavor: BuildFlavor =
  import.meta.env.VITE_APP_FLAVOR === 'development' ? 'development' : 'production';

export const isDevelopmentBuild = buildFlavor === 'development';
export const productName = isDevelopmentBuild ? 'Tempo Dev' : 'Tempo';
