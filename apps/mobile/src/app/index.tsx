import { Redirect } from 'expo-router';

import { APP_ROUTES } from '@/lib/routes';

export default function IndexRedirect() {
  return <Redirect href={APP_ROUTES.home} />;
}
