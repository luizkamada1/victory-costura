import { redirect } from "next/navigation";

// A tela Eficiência virou o Dashboard; o endereço antigo continua funcionando
export default function Eficiencia() {
  redirect("/dashboard");
}
