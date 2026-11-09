import { Component, type ReactNode } from 'react';
import { istVeraltetesModul, neuLadenEinmal } from './modulNeuLaden';

/** Fängt Anzeigefehler ab, damit nicht die ganze App weiß bleibt. */
export class Fehlergrenze extends Component<{ children: ReactNode }, { fehler: Error | null }> {
  state = { fehler: null as Error | null };

  static getDerivedStateFromError(fehler: Error) {
    return { fehler };
  }

  componentDidCatch(fehler: Error) {
    console.error(fehler);
    if (istVeraltetesModul(fehler)) neuLadenEinmal();
  }

  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <div className="banner fehler" style={{ margin: '2rem auto', maxWidth: 560 }}>
        <p>Hier ist leider ein Fehler aufgetreten: {this.state.fehler.message}</p>
        <button className="knopf" onClick={() => this.setState({ fehler: null })}>Zurück</button>{' '}
        <button className="knopf primaer" onClick={() => location.reload()}>Neu laden</button>
      </div>
    );
  }
}
