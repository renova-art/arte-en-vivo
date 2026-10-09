import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Footer, Header } from '../../shared/components/layout';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, Header, Footer],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-header />
    <main>
      <section class="bg-gradient-to-b from-blush-100 via-cream-100 to-cream-50 px-4 py-20 text-center sm:py-28">
        <p class="text-sm uppercase tracking-[0.25em] text-blush-500">Ilustración en vivo</p>
        <h1 class="mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
          Convierte tu evento en un recuerdo dibujado a mano
        </h1>
        <p class="mx-auto mt-5 max-w-xl text-ink-500">
          Retratos ilustrados en directo para tus invitados en bodas, bautizos, comuniones y celebraciones especiales.
        </p>
        <a routerLink="/solicitar-presupuesto" class="btn-primary mt-8 !px-8 !py-3">Solicitar presupuesto</a>
      </section>

      <section id="servicios" class="mx-auto max-w-6xl px-4 py-16">
        <h2 class="text-center text-3xl font-semibold sm:text-4xl">Para cada celebración</h2>
        <div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          @for (s of services; track s.title) {
            <article class="card text-center">
              <div class="text-3xl">{{ s.icon }}</div>
              <h3 class="mt-3 text-xl font-semibold">{{ s.title }}</h3>
              <p class="mt-2 text-sm text-ink-500">{{ s.text }}</p>
            </article>
          }
        </div>
      </section>

      <section class="bg-cream-100 px-4 py-16">
        <div class="mx-auto max-w-4xl">
          <h2 class="text-center text-3xl font-semibold sm:text-4xl">Cómo funciona</h2>
          <ol class="mt-10 grid gap-6 sm:grid-cols-3">
            @for (step of steps; track step.n) {
              <li class="text-center">
                <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush-200 font-serif text-xl text-ink-900">{{ step.n }}</span>
                <h3 class="mt-3 text-lg font-semibold">{{ step.title }}</h3>
                <p class="mt-1 text-sm text-ink-500">{{ step.text }}</p>
              </li>
            }
          </ol>
          <p class="mx-auto mt-10 max-w-xl rounded-xl bg-white p-4 text-center text-sm text-ink-500">
            Capacidad máxima: 10 ilustraciones/hora. Las ilustraciones pueden ser individuales, en pareja o en grupos de máximo 4 personas.
          </p>
        </div>
      </section>

      <section id="portfolio" class="mx-auto max-w-6xl px-4 py-16">
        <h2 class="text-center text-3xl font-semibold sm:text-4xl">Portafolio</h2>
        <p class="mt-2 text-center text-sm text-ink-500">Sustituye estos marcos por tus ilustraciones en <code>public/portfolio</code>.</p>
        <div class="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          @for (g of gallery; track $index) {
            <div class="flex aspect-square items-center justify-center rounded-2xl text-5xl" [class]="g">✎</div>
          }
        </div>
      </section>

      <section class="px-4 py-16 text-center">
        <h2 class="text-3xl font-semibold sm:text-4xl">¿Hablamos de tu evento?</h2>
        <p class="mt-3 text-ink-500">Cuéntanos los detalles y recibirás un presupuesto sin compromiso.</p>
        <a routerLink="/solicitar-presupuesto" class="btn-primary mt-6 !px-8 !py-3">Pedir presupuesto</a>
      </section>
    </main>
    <app-footer />
  `,
})
export class Landing {
  services = [
    { icon: '💍', title: 'Bodas', text: 'Un detalle único que tus invitados se llevarán a casa.' },
    { icon: '🕊️', title: 'Bautizos', text: 'Recuerdos delicados de un día muy especial.' },
    { icon: '🎀', title: 'Comuniones', text: 'Diversión y arte para pequeños y mayores.' },
    { icon: '🎂', title: 'Cumpleaños y más', text: 'Eventos especiales a tu medida.' },
  ];
  steps = [
    { n: 1, title: 'Solicita presupuesto', text: 'Rellena el formulario con los datos de tu evento.' },
    { n: 2, title: 'Reserva la fecha', text: 'Confirma con un 40% de adelanto.' },
    { n: 3, title: 'Disfruta el día', text: 'Dibujamos en directo a tus invitados.' },
  ];
  gallery = [
    'bg-blush-100 text-blush-300', 'bg-sage-100 text-sage-300', 'bg-cream-200 text-ink-500',
    'bg-sage-100 text-sage-300', 'bg-blush-200 text-blush-400', 'bg-cream-100 text-blush-300',
  ];
}
