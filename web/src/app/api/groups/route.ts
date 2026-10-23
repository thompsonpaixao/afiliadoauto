import { NextRequest, NextResponse } from 'next/server';
import { db, ConfigurationGroup } from '@/lib/db';

export async function GET() {
  try {
    const data = db.read();
    return NextResponse.json({
      success: true,
      configurationGroups: data.configuration_groups,
      whatsappGroups: data.whatsapp_groups,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, name, description, groupJids } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'O nome do Grupo de Configuração é obrigatório.' }, { status: 400 });
    }

    if (!Array.isArray(groupJids) || groupJids.length === 0) {
      return NextResponse.json(
        { error: 'Selecione pelo menos um grupo real do WhatsApp.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    let savedGroup: ConfigurationGroup;

    db.update((d) => {
      if (id) {
        const idx = d.configuration_groups.findIndex((g) => g.id === id);
        if (idx >= 0) {
          d.configuration_groups[idx] = {
            ...d.configuration_groups[idx],
            name: name.trim(),
            description: description?.trim() || null,
            groupJids,
            updatedAt: now,
          };
          savedGroup = d.configuration_groups[idx];
        } else {
          throw new Error('Grupo não encontrado para atualização');
        }
      } else {
        savedGroup = {
          id: `cfg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: name.trim(),
          description: description?.trim() || null,
          groupJids,
          createdAt: now,
          updatedAt: now,
        };
        d.configuration_groups.push(savedGroup);
      }

      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'system',
        description: `Grupo de Configuração "${savedGroup.name}" salvo com ${groupJids.length} grupo(s) do WhatsApp.`,
        createdAt: now,
      });
    });

    return NextResponse.json({ success: true, configurationGroup: savedGroup! });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID do grupo não informado' }, { status: 400 });
    }

    db.update((d) => {
      d.configuration_groups = d.configuration_groups.filter((g) => g.id !== id);
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
