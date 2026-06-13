import type { WorldState } from "../../shared/types";
import { buildMvuVariableSnapshot } from "../../shared/mvu/variables";

type MvuVariablePanelProps = {
  world: WorldState;
};

export function MvuVariablePanel({ world }: MvuVariablePanelProps): React.JSX.Element {
  const snapshot = buildMvuVariableSnapshot(world);

  return (
    <section className="mvu-panel">
      <div className="panel-head">
        <div>
          <h2>MVU 变量栏</h2>
          <p>把当前世界拆成可更新、可追踪的变量。</p>
        </div>
        <span className="panel-count">
          {snapshot.totalSections} 组 / {snapshot.totalFields} 项
        </span>
      </div>

      <div className="mvu-sections">
        {snapshot.sections.map((section) => (
          <article className="mvu-section" key={section.title}>
            <div className="mvu-section-head">
              <h3>{section.title}</h3>
              <span>{section.summary}</span>
            </div>

            <dl className="mvu-grid">
              {section.fields.map((field) => (
                <div className="mvu-field" key={field.key}>
                  <dt>
                    <span className="mvu-label">{field.label}</span>
                    <span className="mvu-meta">
                      {field.type} · {field.updateMode}
                    </span>
                  </dt>
                  <dd>
                    <span className="mvu-value">{field.value}</span>
                    <span className="mvu-desc">{field.description}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
