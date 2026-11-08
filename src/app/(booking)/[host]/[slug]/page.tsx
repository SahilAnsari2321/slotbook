
import BookingClient from "./booking-client";

type Props = {
    params: Promise<{
        host: string;
        slug: string;
    }>;
};

export default async function BookingPage({ params }: Props) {
    const { host, slug } = await params;

    return <BookingClient host={host} slug={slug} />;
}
