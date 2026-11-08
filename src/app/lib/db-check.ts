import { prisma } from "./prisma";

async function main() {
    const hosts = await prisma.host.findMany();

    console.log("Database connection successful!");
    console.log("Hosts found:", hosts.length);
    console.log(hosts);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });