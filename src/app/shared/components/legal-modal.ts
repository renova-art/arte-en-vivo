import { Component, HostListener, computed, input, output } from '@angular/core';
import { MAX_ILLUSTRATIONS_PER_HOUR } from '../../core/config/defaults';
import { AppSettings } from '../../core/models';

export type LegalKind = 'terms' | 'privacy';

interface Section {
  title: string;
  paragraphs: string[];
}

@Component({
  selector: 'app-legal-modal',
  standalone: true,
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" (click)="closed.emit()">
      <div
        class="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
      >
        <header class="flex items-start justify-between gap-4 border-b border-cream-200 px-6 py-4">
          <h2 class="text-2xl font-semibold">{{ title() }}</h2>
          <button type="button" class="text-2xl leading-none text-ink-500 hover:text-ink-900" aria-label="Cerrar" (click)="closed.emit()">×</button>
        </header>
        <div class="space-y-5 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-ink-700">
          @for (s of sections(); track s.title) {
            <section>
              <h3 class="mb-1 font-sans text-base font-semibold text-ink-900">{{ s.title }}</h3>
              @for (p of s.paragraphs; track $index) {
                <p class="mt-2">@for (part of parts(p); track $index) {@if (part.bold) {<strong class="font-semibold text-ink-900">{{ part.text }}</strong>} @else {{{ part.text }}}}</p>
              }
            </section>
          }
          <p class="text-xs text-ink-500">Última actualización: {{ updated }}</p>
        </div>
        <footer class="border-t border-cream-200 px-6 py-4 text-right">
          <button type="button" class="btn-primary" (click)="closed.emit()">Entendido</button>
        </footer>
      </div>
    </div>
  `,
})
export class LegalModal {
  kind = input.required<LegalKind>();
  settings = input.required<AppSettings>();
  closed = output<void>();

  readonly updated = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closed.emit();
  }

  /** Divide el texto en tramos; lo marcado como **así** se muestra en negrita. */
  parts(text: string): { text: string; bold: boolean }[] {
    return text.split('**').map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((x) => x.text);
  }

  title = computed(() => (this.kind() === 'terms' ? 'Términos y Condiciones' : 'Política de Protección de Datos (RGPD y LOPDGDD)'));
  sections = computed(() => (this.kind() === 'terms' ? termsSections(this.settings()) : privacySections(this.settings())));
}

/** Datos de identificación a partir de la configuración (estudio y proveedoras). */
function identity({ studio, providers }: AppSettings) {
  const bold = (t: string) => `**${t}**`;
  return {
    studioName: bold(studio.name),
    address: bold(studio.address),
    email: bold(studio.email),
    ids: providers.map((x) => bold(x.name)).join(' y '),
  };
}

function termsSections(settings: AppSettings): Section[] {
  const p = identity(settings);
  return [
    {
      title: '1. Identificación del prestador',
      paragraphs: [
        `El servicio de ilustración en vivo es prestado conjuntamente por ${p.ids}, bajo el nombre comercial «${p.studioName}», con domicilio en ${p.address} (en adelante, «el Estudio»). Para cualquier consulta o gestión, el único canal de contacto es el correo electrónico ${p.email}.`,
        'Estos Términos y Condiciones regulan la solicitud de presupuestos a través de este sitio web y la contratación del servicio por parte de la persona que los solicita (en adelante, «el Cliente»).',
      ],
    },
    {
      title: '2. Objeto del servicio',
      paragraphs: [
        'El servicio consiste en la realización de ilustraciones en directo durante un evento (bodas, bautizos, comuniones, cumpleaños u otras celebraciones) durante el número de horas acordado, y, si así se contrata, de ilustraciones adicionales a posteriori.',
        `La capacidad máxima del servicio es de ${MAX_ILLUSTRATIONS_PER_HOUR} ilustraciones por hora. Las ilustraciones pueden ser individuales, en pareja o en grupos de un máximo de 4 personas.`,
      ],
    },
    {
      title: '3. Solicitud de presupuesto',
      paragraphs: [
        'El envío del formulario constituye una solicitud de presupuesto y no implica la contratación del servicio ni obliga a ninguna de las partes. Los importes mostrados en el formulario son orientativos.',
        'El presupuesto definitivo se remitirá al Cliente con los conceptos y el importe total (incluido, en su caso, el desplazamiento) y tendrá la validez indicada en el propio documento. Los precios se calculan en función del número de invitados y de las horas de servicio.',
      ],
    },
    {
      title: '4. Reserva, pago y facturación',
      paragraphs: [
        'La reserva de la fecha se confirma con el pago del 40 % del importe total del presupuesto. El 60 % restante deberá abonarse la semana anterior al evento o, previa petición y aceptación expresa del Estudio, en efectivo el mismo día del evento.',
        'Los pagos se realizarán por transferencia bancaria a la cuenta indicada en el presupuesto. Hasta la recepción del pago de la reserva, la fecha no queda garantizada.',
      ],
    },
    {
      title: '5. Modificaciones y cancelación',
      paragraphs: [
        'El Cliente podrá solicitar cambios de fecha, horario o duración, que quedarán sujetos a la disponibilidad del Estudio y a su confirmación por escrito.',
        'Las condiciones aplicables en caso de cancelación, incluida la eventual devolución de la cantidad abonada como reserva, serán las que figuren en el presupuesto aceptado o se pacten por escrito entre las partes. De acuerdo con el artículo 103.l) del Real Decreto Legislativo 1/2007 (Ley General para la Defensa de los Consumidores y Usuarios), los servicios de ocio que deben prestarse en una fecha o periodo determinados no están sujetos al derecho de desistimiento de catorce días.',
      ],
    },
    {
      title: '6. Obligaciones del Cliente',
      paragraphs: [
        'El Cliente se compromete a facilitar información veraz sobre el evento, a garantizar un espacio adecuado y seguro para el desarrollo del servicio y a informar al Estudio de cualquier circunstancia que pueda afectarlo (cambios de lugar u horario, restricciones de acceso, etc.).',
      ],
    },
    {
      title: '7. Propiedad intelectual y derechos de imagen',
      paragraphs: [
        'Las ilustraciones son obras originales protegidas por el Real Decreto Legislativo 1/1996 (Ley de Propiedad Intelectual). Los derechos de autor corresponden al Estudio. Quien reciba una ilustración podrá conservarla y usarla con fines personales y no comerciales, y compartirla en redes sociales citando al autor.',
        'Cualquier otro uso (comercial, publicitario, reproducción masiva, etc.) requiere autorización escrita del Estudio.',
        'El Estudio podrá mostrar las ilustraciones realizadas en su portafolio y redes sociales como muestra de su trabajo, salvo que el Cliente manifieste por escrito su oposición. No se publicarán datos personales identificativos sin consentimiento.',
      ],
    },
    {
      title: '8. Responsabilidad y fuerza mayor',
      paragraphs: [
        'El Estudio responderá de la correcta prestación del servicio conforme al presupuesto aceptado. No será responsable del incumplimiento o retraso causado por circunstancias de fuerza mayor o ajenas a su control (enfermedad grave, accidente, fenómenos meteorológicos extremos, restricciones de las autoridades u otras causas semejantes), en cuyo caso las partes acordarán un cambio de fecha o la solución que proceda.',
      ],
    },
    {
      title: '9. Protección de datos',
      paragraphs: [
        'El tratamiento de los datos personales del Cliente se rige por la Política de Protección de Datos, que el Cliente declara haber leído y aceptado.',
      ],
    },
    {
      title: '10. Legislación aplicable y jurisdicción',
      paragraphs: [
        'Estos Términos se rigen por la legislación española. Si el Cliente tiene la condición de consumidor, serán competentes los juzgados y tribunales de su domicilio. El Cliente dispone de hojas de reclamaciones a su disposición y puede dirigirse al Estudio a través de los datos de contacto indicados para cualquier queja o sugerencia.',
      ],
    },
  ];
}

function privacySections(settings: AppSettings): Section[] {
  const p = identity(settings);
  return [
    {
      title: '1. Responsable del tratamiento',
      paragraphs: [
        `Identidad: ${p.ids}, que actúan conjuntamente como corresponsables del tratamiento (art. 26 RGPD) bajo el nombre comercial «${p.studioName}».`,
        `Dirección: ${p.address} · Correo electrónico (único canal de contacto): ${p.email}`,
        'De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), le informamos de cómo tratamos sus datos personales.',
      ],
    },
    {
      title: '2. Datos que tratamos',
      paragraphs: [
        'Datos identificativos y de contacto (nombre y apellidos, teléfono y correo electrónico) y datos del evento que usted nos facilita en el formulario (tipo, fecha, lugar, número de invitados, duración y descripción). No se solicitan categorías especiales de datos.',
      ],
    },
    {
      title: '3. Finalidades y base jurídica',
      paragraphs: [
        'a) Atender su solicitud de presupuesto, elaborarlo y comunicarnos con usted. Base jurídica: aplicación de medidas precontractuales a petición del interesado (art. 6.1.b RGPD).',
        'b) Gestionar la reserva y ejecutar el servicio contratado, así como la facturación y las obligaciones fiscales y contables. Base jurídica: ejecución del contrato (art. 6.1.b RGPD) y cumplimiento de obligaciones legales (art. 6.1.c RGPD).',
        'c) Dejar constancia de la aceptación de los Términos y Condiciones y de esta política. Base jurídica: su consentimiento (art. 6.1.a RGPD) y el interés legítimo en acreditar el cumplimiento (art. 6.1.f RGPD).',
        'No elaboramos perfiles ni adoptamos decisiones automatizadas con efectos jurídicos sobre usted. El importe orientativo que muestra el formulario es un simple cálculo según tarifas y no una decisión automatizada.',
      ],
    },
    {
      title: '4. Plazo de conservación',
      paragraphs: [
        'Conservaremos sus datos durante el tiempo necesario para tramitar su solicitud y, en caso de contratación, durante la vigencia de la relación contractual. Posteriormente se mantendrán bloqueados, a disposición de las autoridades y para la atención de posibles responsabilidades, durante los plazos legales aplicables (con carácter general, hasta 4 años en materia fiscal y hasta 6 años en materia mercantil). Si no se llega a contratar el servicio, los datos se suprimirán en un plazo razonable tras la resolución de su solicitud.',
      ],
    },
    {
      title: '5. Destinatarios y encargados del tratamiento',
      paragraphs: [
        'No cederemos sus datos a terceros salvo obligación legal (Administración tributaria, jueces y tribunales, fuerzas y cuerpos de seguridad).',
        'Para el alojamiento y almacenamiento de la información utilizamos los servicios de Google Firebase (Google Cloud EMEA Limited / Google LLC), que actúan como encargados del tratamiento con las garantías exigidas por el art. 28 RGPD. Cuando el tratamiento implique transferencias internacionales de datos, estas se amparan en las garantías adecuadas previstas en el RGPD (decisión de adecuación, incluido el Marco de Privacidad de Datos UE-EE. UU., o cláusulas contractuales tipo).',
      ],
    },
    {
      title: '6. Sus derechos',
      paragraphs: [
        'Puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad, así como retirar en cualquier momento el consentimiento prestado (sin que ello afecte a la licitud del tratamiento previo), escribiendo a ' + p.email + ' e indicando el derecho que desea ejercer. Podremos solicitarle una copia de un documento que acredite su identidad.',
        'Si considera que el tratamiento no se ajusta a la normativa, tiene derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).',
      ],
    },
    {
      title: '7. Carácter obligatorio de los datos',
      paragraphs: [
        'Los datos marcados como obligatorios en el formulario son necesarios para poder tramitar su solicitud; si no los facilita, no podremos atenderla.',
      ],
    },
    {
      title: '8. Menores de edad',
      paragraphs: [
        'El formulario está dirigido a personas mayores de 14 años. Si la solicitud se realiza en nombre de un menor (por ejemplo, en bautizos o comuniones), deberá hacerla su madre, padre o tutor legal.',
      ],
    },
    {
      title: '9. Medidas de seguridad',
      paragraphs: [
        'Aplicamos medidas técnicas y organizativas adecuadas para proteger sus datos frente a accesos no autorizados, pérdida o alteración. El acceso a la información está restringido a personal autorizado mediante autenticación.',
      ],
    },
  ];
}
