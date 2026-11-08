import BookingManagement from "./booking-management";

type Props = {
    params: Promise<{ token: string }>;
};

export default async function BookingPage({ params }: Props) {
    const { token } = await params;
    return <BookingManagement token={token} />;
}