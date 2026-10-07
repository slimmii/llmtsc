import { User, fulName } from "./user";

const users: User[] = [
  { id: "1", firstName: "Ada", lastName: "Lovelace" },
  { id: 2, firstName: "Alan", lastNme: "Turing" },
];

function domainOf(user: User): string {
  return user.email.split("@")[1];
}

for (const u of users) {
  console.log(fulName(u), domainOf(u) ?? "no email")
  conole.log(u.id.toFixed(0));
}

const total: number = users.lenght;
console.log("total", total;
