// Uso: npm run criar-usuario -- email@empresa.com.br "Nome" senha [--admin]
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

async function main() {
  const [email, nome, senha] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const admin = process.argv.includes("--admin");
  if (!email || !nome || !senha || senha.length < 8) {
    console.error('Uso: npm run criar-usuario -- email "Nome" senha-com-8+ [--admin]');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const senhaHash = await bcrypt.hash(senha, 10);
  await prisma.usuario.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), nome, senhaHash, papel: admin ? "ADMIN" : "USUARIO" },
    update: { nome, senhaHash, ativo: true, ...(admin ? { papel: "ADMIN" } : {}) },
  });
  console.log(`Usuário ${email} pronto${admin ? " (administrador)" : ""}.`);
  await prisma.$disconnect();
}
main();
