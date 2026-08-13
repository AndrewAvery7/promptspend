import Head from 'expo-router/head';

interface WebDocumentHeadProps {
  description: string;
  title: string;
}

export function WebDocumentHead({ description, title }: WebDocumentHeadProps) {
  return (
    <Head>
      <title>{title}</title>
      <meta content={description} name="description" />
    </Head>
  );
}
