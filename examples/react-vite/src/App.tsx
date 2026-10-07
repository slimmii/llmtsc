import { useState } from "react";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export function App({ title }: { title: string }) {
  const [todos, setTodos] = useStat<Todo[]>([]);
  const [draft, setDraft] = useState("");

  const add = () => {
    setTodos([...todos, { id: Date.now(), txt: draft, done: false }]);
    setDraft("");
  };

  return (
    <div>
      <h1>{title}</h1>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button onClick={add}>Add</button>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>{t.text.toUppercase()}</li>
        ))}
      </ul>
    </div>
  );
}
